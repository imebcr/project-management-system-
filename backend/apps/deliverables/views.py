import re
import uuid
from datetime import timedelta
from html import escape

from urllib.parse import urlparse

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from django.db import transaction
from django.db.models import F
from django.http import HttpResponse, HttpResponseRedirect
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.audit.models import audit
from apps.core import shapes, storage
from apps.core.access import can_share_deliverables, can_upload_deliverables, can_view, require_manage
from apps.core.errors import ApiError
from apps.core.throttles import PublicLinkThrottle
from apps.notifications.service import notify
from apps.projects.views import get_project, parse_dt

from .models import LINK_MAX_DAYS, Deliverable, DeliverableVersion, Folder, ShareAccess, ShareLink, UploadSession
from .tasks import compute_sha256


def _deliverable(pk) -> Deliverable:
    d = Deliverable.objects.select_related('project').prefetch_related('versions').filter(pk=pk).first()
    if not d:
        raise ApiError('Livrable introuvable.', 404)
    return d


@api_view(['POST'])
def create_folder(request):
    project = get_project(request.data.get('project_id'))
    require_manage(request.user, project)
    parent = Folder.objects.filter(pk=request.data.get('parent_id'), project=project).first() if request.data.get('parent_id') else None
    if parent and parent.depth >= 3:
        raise ApiError('Profondeur maximale : 3 niveaux (DLV-01).')
    name = (request.data.get('name') or '').strip()
    if not name:
        raise ApiError('Le nom du dossier est obligatoire.')
    return Response(shapes.folder(Folder.objects.create(project=project, name=name, parent=parent)), status=201)


@api_view(['PATCH', 'DELETE'])
def folder_detail(request, pk):
    """Renommer un dossier, ou le supprimer s'il est vide (ni livrable ni sous-dossier)."""
    folder = Folder.objects.select_related('project').filter(pk=pk).first()
    if not folder:
        raise ApiError('Dossier introuvable.', 404)
    require_manage(request.user, folder.project)
    if request.method == 'DELETE':
        if folder.deliverables.exists() or folder.children.exists():
            raise ApiError('Ce dossier n’est pas vide : déplacez ou supprimez d’abord son contenu.')
        audit(request.user, 'FOLDER_DELETE', folder.name, folder.project)
        folder.delete()
        return Response({'ok': True})
    name = (request.data.get('name') or '').strip()[:120]
    if not name:
        raise ApiError('Le nom du dossier est obligatoire.')
    folder.name = name
    folder.save(update_fields=['name'])
    return Response(shapes.folder(folder))


@api_view(['GET'])
def preview_version(request, pk, number):
    """Adresse temporaire (15 min) pour regarder un fichier dans l'application : vidéo, PDF, image…"""
    d = _deliverable(pk)
    if not can_view(request.user, d.project):
        raise ApiError('Livrable introuvable.', 404)
    version = d.versions.filter(number=number).first()
    if not version:
        raise ApiError('Version introuvable.', 404)
    if version.is_link:
        return Response({'url': version.url, 'kind': 'LINK'})
    return Response({
        'url': storage.presigned_get(version.key, version.file_name, expires=900, inline=True),
        'download_url': storage.presigned_get(version.key, version.file_name, expires=900),
        'kind': 'FILE', 'mime': version.mime,
    })


@api_view(['PATCH'])
def update_deliverable(request, pk):
    d = _deliverable(pk)
    require_manage(request.user, d.project)
    if 'due_date' in request.data:
        d.due_date = parse_dt(request.data['due_date'], "L'échéance", required=False)
    if 'status' in request.data:
        _set_stage(request.user, d, request.data['status'], request.data.get('note') or '')
    d.save()
    return Response(shapes.deliverable(_deliverable(d.pk)))


STAGE_NOTICE = {
    'REJECTED_INTERNAL': 'Livrable rejeté avant envoi',
    'SENT': 'Livrable envoyé au client',
    'VALIDATED': 'Livrable validé par le client',
    'REJECTED_CLIENT': 'Livrable rejeté par le client',
}


def _set_stage(user, d, status, note=''):
    # Change l’étape d’un livrable (chef de projet ou admin), dans l’ordre prévu, et prévient l’équipe concernée.
    labels = dict(Deliverable.STATUSES)
    if status not in labels:
        raise ApiError('Étape inconnue.')
    if status == d.status:
        return
    if status not in Deliverable.TRANSITIONS[d.status]:
        raise ApiError(f'« {labels[d.status]} » ne peut pas passer à « {labels[status]} ».')
    if status == 'SENT' and not d.versions.exists():
        raise ApiError('Ce livrable n’a pas encore de fichier ni de lien.')
    d.status = status
    d.status_note = note.strip()[:500] if status.startswith('REJECTED') else ''
    d.status_changed_at, d.status_changed_by = timezone.now(), user
    audit(user, 'DELIVERABLE_STAGE', f'{d.name} → {labels[status]}', d.project)
    if status in STAGE_NOTICE:
        version = d.current_version
        # L'auteur de la dernière version et le chef de projet sont prévenus (pas la personne qui agit).
        targets = {version.uploader_id} if version else set()
        if d.project.head:
            targets.add(d.project.head.pk)
        body = f'{d.name} v{version.number if version else "?"} — {d.project.name}' + (f' · Motif : {d.status_note}' if d.status_note else '')
        notify(targets, 'deliverable', STAGE_NOTICE[status], body, f'/projects/{d.project_id}?tab=deliverables', exclude=user)


# ---------- Dépôt direct navigateur → stockage (DLV-03) ----------

SAFE = re.compile(r'[^A-Za-z0-9._-]+')


def _target(request, d):
    """Projet, dossier et livrable visés par un dépôt (fichier ou lien), avec contrôle des droits."""
    project = get_project(d.get('project_id'))
    if not can_upload_deliverables(request.user, project):
        raise ApiError("Vous n'êtes pas membre de ce projet.", 403)
    folder = Folder.objects.filter(pk=d.get('folder_id'), project=project).first()
    if not folder:
        raise ApiError('Dossier introuvable.')
    deliverable = None
    if d.get('deliverable_id'):
        deliverable = Deliverable.objects.filter(pk=d['deliverable_id'], project=project).first()
        if not deliverable:
            raise ApiError('Livrable introuvable.')
    return project, folder, deliverable


@api_view(['POST'])
def add_link_version(request):
    """Livrable sous forme de lien (Drive, TestFlight, Figma, site de recette…) au lieu d'un fichier."""
    d = request.data
    project, folder, deliverable = _target(request, d)
    url = (d.get('url') or '').strip()
    validator = URLValidator(schemes=['http', 'https'])
    try:
        validator(url)
    except DjangoValidationError:
        raise ApiError('Adresse invalide : elle doit commencer par http:// ou https://.')
    name = (d.get('name') or '').strip()[:160]
    if not deliverable and not name:
        raise ApiError('Donnez un nom au livrable.')
    with transaction.atomic():
        deliverable = deliverable or Deliverable.objects.create(project=project, folder=folder, name=name)
        number = (deliverable.versions.order_by('-number').values_list('number', flat=True).first() or 0) + 1
        if deliverable.status != 'IN_PROGRESS':
            # Nouvelle version : elle repart « En préparation » pour être revue avant envoi.
            deliverable.status, deliverable.status_note = 'IN_PROGRESS', ''
            deliverable.status_changed_at, deliverable.status_changed_by = timezone.now(), request.user
            deliverable.save()
        DeliverableVersion.objects.create(
            deliverable=deliverable, number=number, url=url, file_name=urlparse(url).netloc[:255] or url[:255],
            mime='text/uri-list', note=(d.get('note') or '')[:300], uploader=request.user,
        )
    head = project.head
    if head:
        notify([head], 'deliverable', 'Livrable ajouté', f'{deliverable.name} v{number} (lien) — {project.name}', f'/projects/{project.id}?tab=deliverables', exclude=request.user)
    return Response(shapes.deliverable(_deliverable(deliverable.pk)), status=201)


@api_view(['POST'])
def init_upload(request):
    """Prépare un dépôt : URL présignée unique (≤ 100 Mo) ou multipart avec reprise (au-delà)."""
    d = request.data
    project, folder, deliverable = _target(request, d)
    file_name = (d.get('file_name') or '').strip()
    try:
        size = int(d.get('size'))
    except (TypeError, ValueError):
        raise ApiError('Taille de fichier invalide.')
    if not file_name or size <= 0:
        raise ApiError('Fichier invalide.')
    if size > settings.MAX_DELIVERABLE_BYTES:
        raise ApiError(f'Fichier trop volumineux ({settings.MAX_DELIVERABLE_BYTES // 1024**3} Go max).')
    mime = d.get('mime') or 'application/octet-stream'
    key = f'deliverables/{project.id}/{uuid.uuid4().hex}/{SAFE.sub("_", file_name)[:180]}'
    session = UploadSession(
        project=project, folder=folder, deliverable=deliverable, name=(d.get('name') or file_name).strip()[:160],
        key=key, file_name=file_name, size=size, mime=mime, user=request.user,
    )
    if size > settings.MULTIPART_THRESHOLD:
        session.upload_id = storage.multipart_create(key, mime)
        session.part_size = settings.MULTIPART_PART_SIZE
    session.save()
    body = {'session_id': str(session.id), 'multipart': session.multipart}
    if session.multipart:
        body.update(part_size=session.part_size, part_count=session.part_count)
    else:
        body['url'] = storage.presigned_put(key, mime)
    return Response(body, status=201)


def _session(request, pk) -> UploadSession:
    s = UploadSession.objects.filter(pk=pk, user=request.user).first()
    if not s:
        raise ApiError('Dépôt introuvable ou expiré.', 404)
    return s


@api_view(['GET'])
def upload_parts(request, pk):
    """Reprise : parties déjà reçues + URLs présignées des parties demandées."""
    s = _session(request, pk)
    if not s.multipart:
        raise ApiError("Ce dépôt n'est pas en plusieurs parties.")
    numbers = [int(n) for n in request.query_params.get('numbers', '').split(',') if n.strip().isdigit()]
    numbers = [n for n in numbers if 1 <= n <= s.part_count][:50]
    done = storage.multipart_parts(s.key, s.upload_id)
    return Response({
        'done': [p['PartNumber'] for p in done],
        'part_size': s.part_size,
        'part_count': s.part_count,
        'urls': {str(n): storage.multipart_part_url(s.key, s.upload_id, n) for n in numbers},
    })


@api_view(['POST'])
def complete_upload(request, pk):
    """Finalise le dépôt et crée la version (DLV-02). L'empreinte SHA-256 est calculée en tâche de fond."""
    s = _session(request, pk)
    if s.multipart:
        storage.multipart_complete(s.key, s.upload_id)
    meta = storage.head(s.key)
    if not meta:
        raise ApiError("Le fichier n'est pas arrivé dans le stockage. Relancez le dépôt.")
    with transaction.atomic():
        deliverable = s.deliverable or Deliverable.objects.create(project=s.project, folder=s.folder, name=s.name)
        number = (deliverable.versions.order_by('-number').values_list('number', flat=True).first() or 0) + 1
        if deliverable.status != 'IN_PROGRESS':
            # Nouvelle version : elle repart « En préparation » pour être revue avant envoi.
            deliverable.status, deliverable.status_note = 'IN_PROGRESS', ''
            deliverable.status_changed_at, deliverable.status_changed_by = timezone.now(), request.user
            deliverable.save()
        version = DeliverableVersion.objects.create(
            deliverable=deliverable, number=number, key=s.key, file_name=s.file_name, size=meta.get('ContentLength', s.size),
            mime=s.mime, note=(request.data.get('note') or '')[:300], uploader=request.user,
        )
        s.delete()
    transaction.on_commit(lambda: compute_sha256.delay(str(version.id)))
    head = s.project.head
    if head:
        notify([head], 'deliverable', 'Livrable déposé', f'{deliverable.name} v{number} — {s.project.name}', f'/projects/{s.project_id}?tab=deliverables', exclude=request.user)
    return Response(shapes.deliverable(_deliverable(deliverable.pk)), status=201)


@api_view(['DELETE'])
def abort_upload(request, pk):
    s = _session(request, pk)
    if s.multipart:
        try:
            storage.multipart_abort(s.key, s.upload_id)
        except Exception:
            pass
    s.delete()
    return Response({'ok': True})


# ---------- Liens client (DLV-05 / DLV-07) ----------

@api_view(['POST'])
def copy_link(request, pk):
    """« Copier le lien » : lien de la version courante, réutilisé s'il est encore actif."""
    d = _deliverable(pk)
    if not can_share_deliverables(request.user, d.project):
        raise ApiError("Seuls l'admin et le responsable partagent un livrable.", 403)
    current = d.current_version
    if not current:
        raise ApiError('Ce livrable n’a pas encore de fichier ni de lien.')
    if d.status == 'REJECTED_INTERNAL':
        raise ApiError('Ce livrable a été rejeté avant envoi : déposez une nouvelle version avant de le partager.')
    link = ShareLink.objects.filter(version=current, revoked=False, expires_at__gte=timezone.now()).first()
    created = link is None
    if created:
        link = ShareLink.objects.create(project=d.project, version=current, created_by=request.user)
        if d.status == 'IN_PROGRESS':
            _set_stage(request.user, d, 'SENT')
            d.save()
    return Response({**shapes.share_link(link), 'url': f'{settings.PUBLIC_URL}/s/{link.token}'}, status=201 if created else 200)


def _link(pk) -> ShareLink:
    link = ShareLink.objects.select_related('project', 'version').filter(pk=pk).first()
    if not link:
        raise ApiError('Lien introuvable.', 404)
    return link


@api_view(['PATCH'])
def update_link(request, pk):
    """Expiration réglable, 90 jours maximum à partir de la création."""
    link = _link(pk)
    require_manage(request.user, link.project)
    try:
        days = min(LINK_MAX_DAYS, max(1, int(request.data.get('days'))))
    except (TypeError, ValueError):
        raise ApiError('Durée invalide.')
    link.expires_at = link.created_at + timedelta(days=days)
    link.save(update_fields=['expires_at'])
    return Response(shapes.share_link(link))


@api_view(['POST'])
def revoke_link(request, pk):
    link = _link(pk)
    require_manage(request.user, link.project)
    link.revoked = True
    link.save(update_fields=['revoked'])
    audit(request.user, 'LINK_REVOKE', f'/s/{link.token[:8]}…', link.project)
    return Response(shapes.share_link(link))


# ---------- GET /s/<token> : téléchargement direct (DLV-06 v1.1) ----------

PREVIEW_BOTS = re.compile(
    r'whatsapp|facebookexternalhit|facebot|meta-externalagent|telegrambot|slackbot|twitterbot|linkedinbot|discordbot|'
    r'skypeuripreview|embedly|pinterest|redditbot|applebot|googlebot|bingbot|viber|snapchat|iframely|vkshare|line/',
    re.IGNORECASE,
)


def is_preview_bot(user_agent: str | None) -> bool:
    return bool(user_agent and PREVIEW_BOTS.search(user_agent))


def human_size(n: int) -> str:
    for unit, step in (('Go', 1024**3), ('Mo', 1024**2), ('Ko', 1024)):
        if n >= step:
            return f'{n / step:.1f} {unit}'.replace('.0 ', ' ')
    return f'{n} o'


def _page(title: str, body: str, status: int = 200, og: dict | None = None) -> HttpResponse:
    meta = ''.join(f'<meta property="og:{k}" content="{escape(v)}">' for k, v in (og or {}).items())
    html = (
        f'<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<meta name="robots" content="noindex"><title>{escape(title)}</title>{meta}<style>body{{margin:0;min-height:100vh;display:flex;'
        f'align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:linear-gradient(135deg,#E9FCFF 0%,#A9EFFB 45%,#E8EBEF 100%);'
        f'color:#0C224B}}main{{background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.7);border-radius:24px;padding:32px;max-width:360px;'
        f'text-align:center}}h1{{font-size:18px;margin:0 0 8px}}p{{margin:0;font-size:14px;opacity:.65}}</style></head>'
        f'<body><main><h1>{escape(title)}</h1><p>{escape(body)}</p></main></body></html>'
    )
    response = HttpResponse(html, status=status, content_type='text/html; charset=utf-8')
    response['Cache-Control'] = 'no-store'
    response['X-Robots-Tag'] = 'noindex'
    return response


def _client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    return forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([PublicLinkThrottle])
def public_link(request, token):
    """
    - Robot d'aperçu (WhatsApp, Telegram…) : page Open Graph, sans redirection, sans comptage ni notification.
    - Humain : fichier → 302 vers une URL présignée courte avec Content-Disposition: attachment (téléchargement) ;
      lien → 302 vers l'adresse du livrable.
    - Lien expiré, révoqué ou inexistant : la même page « Lien indisponible ».
    """
    link = ShareLink.objects.select_related('version__deliverable', 'project').filter(token=token).first()
    if not link or not link.is_active:
        return _page('Lien indisponible', "Ce lien a expiré ou n'est plus valide. Contactez votre interlocuteur Zidny.", status=404)
    version = link.version
    ua = request.META.get('HTTP_USER_AGENT', '')
    if is_preview_bot(ua):
        title = version.deliverable.name if version.is_link else version.file_name
        description = f'Lien · {version.file_name} · partagé par Zidny' if version.is_link else f'{human_size(version.size)} · mis à disposition par Zidny'
        return _page(title, description, og={'title': title, 'description': description, 'site_name': 'Zidny', 'type': 'website'})
    with transaction.atomic():
        ShareLink.objects.filter(pk=link.pk).update(downloads=F('downloads') + 1)
        ShareAccess.objects.create(link=link, ip=_client_ip(request), user_agent=ua[:400])
    notify([link.created_by_id], 'deliverable', 'Lien ouvert par le client' if version.is_link else 'Lien téléchargé par le client',
           f'{version.deliverable.name} v{version.number} — {link.downloads + 1}e {"ouverture" if version.is_link else "téléchargement"}.', f'/projects/{link.project_id}?tab=deliverables')
    target = version.url if version.is_link else storage.presigned_get(version.key, version.file_name, expires=300)
    response = HttpResponseRedirect(target)
    response['Cache-Control'] = 'no-store'
    response['Referrer-Policy'] = 'no-referrer'
    return response
