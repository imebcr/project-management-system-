from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from apps.accounts.views import check_reauth
from apps.audit.models import audit
from apps.core import shapes
from apps.core.access import can_manage, is_admin, require_manage
from apps.core.errors import ApiError
from apps.core.throttles import RevealThrottle
from apps.deliverables.views import _client_ip
from apps.infra.models import Server
from apps.notifications.service import admins, notify
from apps.projects.views import get_project, parse_dt

from .models import CATEGORIES, VaultAccessLog, VaultEntry, VaultGrant

User = get_user_model()


def visible_entries(user):
    """VLT-03 : admin toutes ; responsable celles de ses projets ; dev celles partagées avec lui (non expirées)."""
    qs = VaultEntry.objects.select_related('project').prefetch_related('grants')
    if is_admin(user):
        return qs
    now = timezone.now()
    return qs.filter(
        Q(project__memberships__user=user, project__memberships__role='HEAD')
        | Q(grants__user=user, grants__expires_at__isnull=True)
        | Q(grants__user=user, grants__expires_at__gte=now)
    ).distinct()


def _entry_for(user, pk) -> VaultEntry:
    entry = visible_entries(user).filter(pk=pk).first()
    if not entry:
        raise ApiError('Accès refusé.', 403)
    return entry


def _log(request, entry, action):
    VaultAccessLog.objects.create(entry=entry, user=request.user, action=action, ip=_client_ip(request), device=request.META.get('HTTP_USER_AGENT', '')[:200])


@api_view(['POST'])
def create_entry(request):
    d = request.data
    project = get_project(d.get('project_id')) if d.get('project_id') else None
    if project:
        require_manage(request.user, project)
    elif not is_admin(request.user):
        raise ApiError("Seul l'admin crée un accès global.", 403)
    if d.get('category') not in dict(CATEGORIES):
        raise ApiError('Catégorie inconnue.')
    label, secret = (d.get('label') or '').strip(), d.get('secret') or ''
    if not label or not secret:
        raise ApiError('Libellé et secret sont obligatoires.')
    entry = VaultEntry(
        category=d['category'], label=label, project=project, url=d.get('url', ''), username=d.get('username', ''), created_by=request.user,
        # Le champ « serveur lié » n'est renseigné et exposé que par l'admin (v1.1).
        server=Server.objects.filter(pk=d.get('server_id')).first() if is_admin(request.user) and d.get('server_id') else None,
    )
    entry.set_secret(secret, d.get('secret_notes', ''))
    entry.save()
    _log(request, entry, 'CREATE')
    audit(request.user, 'VAULT_CREATE', label, project)
    return Response(shapes.vault_entry(entry, is_admin(request.user)), status=201)


@api_view(['POST'])
@throttle_classes([RevealThrottle])
def reveal(request, pk):
    """VLT-04/05/06 : ré-authentification < 5 min, journalisation, 20 révélations par heure au plus."""
    entry = _entry_for(request.user, pk)
    check_reauth(request)
    hour_ago = timezone.now() - timedelta(hours=1)
    recent = VaultAccessLog.objects.filter(user=request.user, action='REVEAL', created_at__gte=hour_ago).count()
    if recent >= settings.VAULT_REVEALS_PER_HOUR:
        _log(request, entry, 'BLOCKED')
        notify(admins(), 'vault', 'Révélation bloquée', f'{request.user.name} a dépassé {settings.VAULT_REVEALS_PER_HOUR} révélations / heure.', '/admin',
               dedupe_key=f'vault-block-{request.user.pk}-{timezone.now():%Y%m%d%H}')
        raise ApiError(f"Limite de {settings.VAULT_REVEALS_PER_HOUR} révélations par heure atteinte. L'admin a été notifié.", 429)
    secret, notes = entry.reveal()
    _log(request, entry, 'REVEAL')
    audit(request.user, 'VAULT_REVEAL', entry.label, entry.project)
    response = Response({'secret': secret, 'secret_notes': notes})
    response['Cache-Control'] = 'no-store'
    return response


@api_view(['POST'])
def log_action(request, pk):
    entry = _entry_for(request.user, pk)
    action = request.data.get('action')
    if action != 'COPY':
        raise ApiError('Action inconnue.')
    _log(request, entry, action)
    return Response({'ok': True})


@api_view(['POST'])
def grant(request, pk):
    entry = _entry_for(request.user, pk)
    if not (is_admin(request.user) or (entry.project and can_manage(request.user, entry.project))):
        raise ApiError("Seuls l'admin et le responsable partagent un accès.", 403)
    user = User.objects.filter(pk=request.data.get('user_id'), is_active=True).first()
    if not user:
        raise ApiError('Utilisateur introuvable.')
    if entry.project and not entry.project.memberships.filter(user=user).exists():
        raise ApiError("Ce dev n'est pas membre du projet.")
    expires = parse_dt(request.data.get('expires_at'), "L'expiration", required=False)
    VaultGrant.objects.update_or_create(entry=entry, user=user, defaults={'expires_at': expires})
    _log(request, entry, 'SHARE')
    audit(request.user, 'VAULT_SHARE', f'{entry.label} → {user.name}', entry.project)
    return Response(shapes.vault_entry(entry, is_admin(request.user)))
