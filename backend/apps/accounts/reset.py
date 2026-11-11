"""
« Mot de passe oublié ? » : lien par e-mail, valable 1 heure et utilisable une seule fois
(le jeton de Django devient invalide dès que le mot de passe change).
"""
import logging

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.db import transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from apps.audit.models import audit
from apps.core.errors import ApiError
from apps.core.throttles import PasswordResetThrottle

from . import emails
from .models import User

log = logging.getLogger(__name__)
SENT = 'Si un compte actif existe pour cette adresse, un e-mail vient de lui être envoyé. Pensez à vérifier les spams.'


def reset_url(user) -> str:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    return f'{settings.PUBLIC_URL}/reset/{uid}/{default_token_generator.make_token(user)}'


def _user_from(uid: str):
    try:
        return User.objects.filter(pk=force_str(urlsafe_base64_decode(uid)), is_active=True).first()
    except (TypeError, ValueError, OverflowError):
        return None


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetThrottle])
def forgot_password(request):
    """Toujours la même réponse : on ne révèle pas si l'adresse a un compte."""
    email = (request.data.get('email') or '').strip().lower()
    user = User.objects.filter(email__iexact=email, is_active=True).first() if email else None
    # Au plus un e-mail toutes les 2 minutes pour une même adresse.
    if user and cache.add(f'pwd-reset:{user.pk}', 1, 120):
        if not emails.send_password_reset(user, reset_url(user)):
            log.warning('E-mail de réinitialisation non envoyé à %s', user.email)
        audit(user, 'PASSWORD_RESET_REQUEST', user.email)
    return Response({'ok': True, 'message': SENT})


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetThrottle])
def check_reset(request, uid, token):
    user = _user_from(uid)
    valid = bool(user and default_token_generator.check_token(user, token))
    return Response({'valid': valid, 'email': user.email if valid else None, 'name': user.name if valid else None})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetThrottle])
def reset_password_confirm(request):
    from .views import _check_password
    user = _user_from(request.data.get('uid') or '')
    if not user or not default_token_generator.check_token(user, request.data.get('token') or ''):
        raise ApiError('Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.')
    password = request.data.get('password') or ''
    _check_password(user, password)
    with transaction.atomic():
        user.set_password(password)
        user.must_change_password = False
        user.save()
        # Toutes les sessions ouvertes ailleurs sont fermées.
        for t in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=t)
        audit(user, 'PASSWORD_RESET_DONE', user.email)
    cache.delete(f'login-lock:{user.email}')
    return Response({'ok': True})
