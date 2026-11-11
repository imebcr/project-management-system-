"""
Authentification (§5.2) et comptes (ADM-01, Q5).
Le refresh token voyage dans un cookie httpOnly (jamais accessible au JavaScript) ;
l'access token (15 min) est renvoyé dans la réponse et gardé en mémoire par le frontend.
"""
import secrets

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core import signing
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.audit.models import audit
from apps.core import shapes
from apps.core.access import require_admin
from apps.core.errors import ApiError
from apps.core.throttles import LoginThrottle, ReauthThrottle

from . import emails
from .models import ROLE_CODES, clean_roles, DEPARTMENTS, Invitation, UserPreference, invite_expiry, new_token

User = get_user_model()
MAX_ATTEMPTS = 5
LOCK_SECONDS = 60


# ---------- Cookie de refresh ----------

def _set_refresh(response, refresh: str):
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME, refresh, max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        httponly=True, secure=settings.REFRESH_COOKIE_SECURE, samesite='Lax', path=settings.REFRESH_COOKIE_PATH,
    )
    return response


def _session(user) -> Response:
    refresh = RefreshToken.for_user(user)
    user.last_login = timezone.now()
    user.save(update_fields=['last_login'])
    return _set_refresh(Response({'access': str(refresh.access_token), 'user': shapes.user(user)}), str(refresh))


def _check_password(user, password: str):
    try:
        validate_password(password, user)
    except Exception as e:
        raise ApiError(' '.join(getattr(e, 'messages', [str(e)])))


def temp_password() -> str:
    """Mot de passe temporaire lisible (ex. « K7QF-m2x9-Tb4A ») qui respecte les règles de complexité."""
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    while True:
        raw = ''.join(secrets.choice(alphabet) for _ in range(12))
        pwd = f'{raw[:4]}-{raw[4:8]}-{raw[8:]}'
        if any(c.islower() for c in pwd) and any(c.isupper() for c in pwd) and any(c.isdigit() for c in pwd):
            return pwd


# ---------- Session ----------

class LoginInput(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def login(request):
    data = LoginInput(data=request.data)
    data.is_valid(raise_exception=True)
    email = data.validated_data['email'].strip().lower()
    lock_key = f'login-lock:{email}'
    attempts = cache.get(lock_key, 0)
    if attempts >= MAX_ATTEMPTS:
        raise ApiError('Trop de tentatives. Compte verrouillé 1 minute.', 429)
    candidate = User.objects.filter(email=email).first()
    user = authenticate(request, email=email, password=data.validated_data['password'])
    if user is None:
        if candidate and not candidate.is_active and candidate.check_password(data.validated_data['password']):
            raise ApiError("Ce compte est désactivé. Contactez l'admin.", 403)
        cache.set(lock_key, attempts + 1, LOCK_SECONDS)
        raise ApiError(
            'Trop de tentatives. Compte verrouillé 1 minute.' if attempts + 1 >= MAX_ATTEMPTS else 'E-mail ou mot de passe incorrect.', 401,
        )
    cache.delete(lock_key)
    return _session(user)


@api_view(['POST'])
@permission_classes([AllowAny])
def refresh(request):
    token = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
    if not token:
        raise ApiError('Session expirée. Reconnectez-vous.', 401)
    ser = TokenRefreshSerializer(data={'refresh': token})
    try:
        ser.is_valid(raise_exception=True)
    except Exception:
        raise ApiError('Session expirée. Reconnectez-vous.', 401)
    user_id = RefreshToken(ser.validated_data.get('refresh', token)).get('user_id')
    user = User.objects.filter(pk=user_id, is_active=True).first()
    if not user:
        raise ApiError('Session expirée. Reconnectez-vous.', 401)
    response = Response({'access': ser.validated_data['access'], 'user': shapes.user(user)})
    if 'refresh' in ser.validated_data:
        _set_refresh(response, ser.validated_data['refresh'])
    return response


@api_view(['POST'])
@permission_classes([AllowAny])
def logout(request):
    token = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
    if token:
        try:
            RefreshToken(token).blacklist()
        except TokenError:
            pass
    response = Response({'ok': True})
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=settings.REFRESH_COOKIE_PATH)
    return response


class PasswordInput(serializers.Serializer):
    current = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    new = serializers.CharField()


@api_view(['POST'])
def change_password(request):
    """Le mot de passe actuel n'est pas redemandé juste après une connexion avec mot de passe temporaire (Q5)."""
    data = PasswordInput(data=request.data)
    data.is_valid(raise_exception=True)
    user = request.user
    current, new = data.validated_data.get('current'), data.validated_data['new']
    if not user.must_change_password and not (current and user.check_password(current)):
        raise ApiError('Mot de passe actuel incorrect.')
    if user.check_password(new):
        raise ApiError('Choisissez un mot de passe différent de l’actuel.')
    _check_password(user, new)
    user.set_password(new)
    user.must_change_password = False
    user.save()
    audit(user, 'PASSWORD_CHANGE', user.name)
    return Response({'ok': True})


@api_view(['POST'])
@throttle_classes([ReauthThrottle])
def reauth(request):
    """§5.2 : ré-authentification de moins de 5 minutes avant de révéler un secret du coffre."""
    password = request.data.get('password', '')
    if not request.user.check_password(password):
        raise ApiError('Mot de passe incorrect.', 403)
    token = signing.TimestampSigner(salt='zidny-reauth').sign(str(request.user.pk))
    return Response({'reauth_token': token, 'expires_in': settings.REAUTH_TTL_SECONDS})


def check_reauth(request):
    token = request.headers.get('X-Reauth-Token', '')
    try:
        value = signing.TimestampSigner(salt='zidny-reauth').unsign(token, max_age=settings.REAUTH_TTL_SECONDS)
    except signing.BadSignature:
        raise ApiError('Confirmez votre mot de passe pour révéler ce secret.', 403)
    if value != str(request.user.pk):
        raise ApiError('Confirmez votre mot de passe pour révéler ce secret.', 403)


@api_view(['GET', 'PATCH'])
def me(request):
    if request.method == 'PATCH':
        name = (request.data.get('name') or '').strip()
        if not name:
            raise ApiError('Le nom est obligatoire.')
        request.user.name = name
        request.user.save(update_fields=['name'])
    return Response(shapes.user(request.user))


@api_view(['PATCH'])
def preferences(request):
    view = request.data.get('projects_view')
    if view not in ('list', 'kanban'):
        raise ApiError('Vue inconnue.')
    UserPreference.objects.update_or_create(user=request.user, defaults={'projects_view': view})
    return Response({'ok': True})


# ---------- Comptes (admin) ----------

class AccountInput(serializers.Serializer):
    """Rôles cumulables : `roles` (liste). `role` seul reste accepté pour compatibilité."""

    email = serializers.EmailField()
    name = serializers.CharField(max_length=120)
    roles = serializers.ListField(child=serializers.ChoiceField(choices=ROLE_CODES), required=False)
    role = serializers.ChoiceField(choices=ROLE_CODES, required=False)
    department = serializers.ChoiceField(choices=[d for d, _ in DEPARTMENTS])

    def validate(self, attrs):
        roles = clean_roles(attrs.pop('roles', None) or attrs.pop('role', None) or [])
        if not roles:
            raise serializers.ValidationError({'roles': 'Choisissez au moins un rôle.'})
        attrs['roles'] = roles
        attrs['name'] = attrs['name'].strip()
        attrs['email'] = attrs['email'].strip().lower()
        return attrs


def _roles_from(data) -> list[str]:
    roles = clean_roles(data.get('roles') if 'roles' in data else data.get('role'))
    if not roles:
        raise ApiError('Choisissez au moins un rôle.')
    return roles


def _email_taken(email: str, *, except_user=None, except_invitation=None) -> bool:
    users = User.objects.filter(email__iexact=email)
    invitations = Invitation.objects.filter(email__iexact=email, status='PENDING', expires_at__gt=timezone.now())
    if except_user:
        users = users.exclude(pk=except_user.pk)
    if except_invitation:
        invitations = invitations.exclude(pk=except_invitation.pk)
    return users.exists() or invitations.exists()


def _clean_name(value) -> str:
    name = (value or '').strip()
    if not name:
        raise ApiError('Le nom est obligatoire.')
    return name[:120]


def _clean_email(value) -> str:
    email = (value or '').strip().lower()
    try:
        validate_email(email)
    except DjangoValidationError:
        raise ApiError('Adresse e-mail invalide.')
    return email


def _clean_department(value) -> str:
    if value not in dict(DEPARTMENTS):
        raise ApiError('Département inconnu.')
    return value


@api_view(['PATCH'])
def update_user(request, pk):
    """Modifier un membre : nom, e-mail, département, rôles (cumulables), statut actif."""
    require_admin(request.user)
    user = User.objects.filter(pk=pk).first()
    if not user:
        raise ApiError('Compte introuvable.', 404)
    d, me = request.data, user.pk == request.user.pk
    changes = []
    if 'name' in d:
        user.name = _clean_name(d['name'])
        changes.append('nom')
    if 'email' in d:
        email = _clean_email(d['email'])
        if email != user.email:
            if _email_taken(email, except_user=user):
                raise ApiError('Un compte ou une invitation en cours existe déjà pour cet e-mail.')
            user.email = email
            changes.append('e-mail')
    if 'department' in d:
        user.department = _clean_department(d['department'])
        changes.append('département')
    if 'roles' in d or 'role' in d:
        roles = _roles_from(d)
        if me and 'ADMIN' not in roles:
            raise ApiError('Vous ne pouvez pas retirer votre propre rôle Admin.')
        other_admins = User.objects.filter(roles__contains=['ADMIN'], is_active=True).exclude(pk=user.pk)
        if 'ADMIN' in user.roles and 'ADMIN' not in roles and not other_admins.exists():
            raise ApiError('Il faut garder au moins un admin actif.')
        if roles != list(user.roles):
            audit(request.user, 'ROLE_CHANGE', f"{user.name} → {' + '.join(roles)}")
        user.roles = roles
    if 'active' in d:
        if me:
            raise ApiError('Vous ne pouvez pas désactiver votre propre compte.')
        user.is_active = bool(d['active'])
        audit(request.user, 'USER_ACTIVATE' if user.is_active else 'USER_DEACTIVATE', user.name)
    user.save()
    if changes:
        audit(request.user, 'USER_UPDATE', f"{user.name} ({', '.join(changes)})")
    return Response(shapes.user(user))


@api_view(['POST'])
def reset_password(request, pk):
    require_admin(request.user)
    user = User.objects.filter(pk=pk, is_active=True).first()
    if not user or user.pk == request.user.pk:
        raise ApiError('Compte introuvable.', 404)
    password = temp_password()
    user.set_password(password)
    user.must_change_password = True
    user.save()
    audit(request.user, 'PASSWORD_RESET', user.name)
    return Response({'password': password})


# ---------- Invitations ----------

def invite_url(invitation) -> str:
    return f'{settings.PUBLIC_URL}/invite/{invitation.token}'


def _send_invitation(invitation) -> bool:
    return emails.send_invitation(invitation, invite_url(invitation))


def _invitation_response(invitation, sent: bool, status=200) -> Response:
    return Response({'invitation': shapes.invitation(invitation), 'url': invite_url(invitation), 'email_sent': sent}, status=status)


@api_view(['POST'])
def create_invitation(request):
    require_admin(request.user)
    data = AccountInput(data=request.data)
    data.is_valid(raise_exception=True)
    v = data.validated_data
    if _email_taken(v['email']):
        raise ApiError('Un compte ou une invitation en cours existe déjà pour cet e-mail.')
    invitation = Invitation.objects.create(email=v['email'], name=v['name'], roles=v['roles'], department=v['department'], invited_by=request.user)
    sent = _send_invitation(invitation)
    audit(request.user, 'USER_INVITE', f"{invitation.email} ({' + '.join(invitation.roles)})")
    return _invitation_response(invitation, sent, status=201)


@api_view(['POST'])
def resend_invitation(request, pk):
    """Nouveau lien (l'ancien jeton devient invalide) et nouvelle échéance de 7 jours."""
    require_admin(request.user)
    invitation = Invitation.objects.filter(pk=pk).exclude(status='ACCEPTED').first()
    if not invitation:
        raise ApiError('Invitation introuvable.', 404)
    invitation.token, invitation.status, invitation.expires_at = new_token(), 'PENDING', invite_expiry()
    invitation.save()
    sent = _send_invitation(invitation)
    audit(request.user, 'INVITE_RESEND', invitation.email)
    return _invitation_response(invitation, sent)


@api_view(['PATCH'])
def update_invitation(request, pk):
    """Modifier une invitation en attente. Si l'e-mail change, un nouveau lien part à la nouvelle adresse."""
    require_admin(request.user)
    invitation = Invitation.objects.filter(pk=pk, status='PENDING').first()
    if not invitation:
        raise ApiError('Invitation introuvable ou déjà utilisée.', 404)
    d, sent, email_changed = request.data, None, False
    if 'name' in d:
        invitation.name = _clean_name(d['name'])
    if 'department' in d:
        invitation.department = _clean_department(d['department'])
    if 'roles' in d or 'role' in d:
        invitation.roles = _roles_from(d)
    if 'email' in d:
        email = _clean_email(d['email'])
        if email != invitation.email:
            if _email_taken(email, except_invitation=invitation):
                raise ApiError('Un compte ou une invitation en cours existe déjà pour cet e-mail.')
            # L'ancien lien, envoyé à l'ancienne adresse, cesse de fonctionner.
            invitation.email, email_changed = email, True
            invitation.token, invitation.expires_at = new_token(), invite_expiry()
    invitation.save()
    if email_changed:
        sent = _send_invitation(invitation)
    audit(request.user, 'INVITE_UPDATE', invitation.email)
    return Response({'invitation': shapes.invitation(invitation), 'url': invite_url(invitation), 'email_sent': sent})


@api_view(['POST'])
def revoke_invitation(request, pk):
    require_admin(request.user)
    invitation = Invitation.objects.filter(pk=pk, status='PENDING').first()
    if not invitation:
        raise ApiError('Invitation introuvable.', 404)
    invitation.status = 'REVOKED'
    invitation.save(update_fields=['status'])
    audit(request.user, 'INVITE_REVOKE', invitation.email)
    return Response({'ok': True})


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def invitation_info(request, token):
    invitation = Invitation.objects.select_related('invited_by').filter(token=token).first()
    if not invitation:
        return Response({'status': 'UNKNOWN'})
    status = 'EXPIRED' if invitation.status == 'PENDING' and not invitation.is_usable else invitation.status
    return Response({
        'status': status, 'email': invitation.email, 'name': invitation.name, 'roles': list(invitation.roles), 'role': invitation.role,
        'department': invitation.department, 'expires_at': shapes.iso(invitation.expires_at), 'invited_by_name': invitation.invited_by.name if invitation.invited_by_id else None,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def accept_invitation(request):
    token, name, password = request.data.get('token', ''), (request.data.get('name') or '').strip(), request.data.get('password', '')
    with transaction.atomic():
        invitation = Invitation.objects.select_for_update().filter(token=token).first()
        if not invitation or not invitation.is_usable:
            raise ApiError('Invitation invalide ou expirée.')
        if User.objects.filter(email__iexact=invitation.email).exists():
            raise ApiError('Un compte existe déjà pour cet e-mail.')
        _check_password(User(email=invitation.email, name=name), password)
        user = User.objects.create_user(email=invitation.email, password=password, name=name or invitation.name, roles=list(invitation.roles), department=invitation.department)
        invitation.status, invitation.accepted_user = 'ACCEPTED', user
        invitation.save()
        audit(user, 'INVITE_ACCEPT', user.email)
    return _session(user)
