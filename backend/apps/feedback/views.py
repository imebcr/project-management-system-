import json
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.core import shapes
from apps.core.access import can_post_feedback, require_manage
from apps.core.errors import ApiError
from apps.deliverables.models import Deliverable
from apps.notifications.service import notify
from apps.projects.views import get_project, parse_dt
from apps.tasks.models import Task

from .models import CHANNELS, STATUSES, TYPES, Feedback, FeedbackImage

MAX_IMAGES = 6
MAX_IMAGE_BYTES = 10 * 1024 * 1024

User = get_user_model()


def _get(pk) -> Feedback:
    f = Feedback.objects.select_related('project').filter(pk=pk).first()
    if not f:
        raise ApiError('Retour introuvable.', 404)
    return f


@api_view(['POST'])
def create_feedback(request):
    """v1.2 : retour texte + photos (6 max) sur l'application ou une version de livrable ; le responsable est notifié."""
    d = request.data
    project = get_project(d.get('project_id'))
    if not can_post_feedback(request.user, project):
        raise ApiError("Vous n'êtes pas membre de ce projet.", 403)
    images = request.FILES.getlist('images')
    content = (d.get('content') or '').strip()
    if not content and not images:
        raise ApiError('Ajoutez un texte ou au moins une photo.')
    if len(images) > MAX_IMAGES:
        raise ApiError(f'{MAX_IMAGES} photos maximum par retour.')
    for img in images:
        if not (img.content_type or '').startswith('image/'):
            raise ApiError(f"{img.name} n'est pas une image.")
        if img.size > MAX_IMAGE_BYTES:
            raise ApiError(f'{img.name} dépasse 10 Mo.')
    deliverable = None
    if d.get('deliverable_id'):
        deliverable = Deliverable.objects.filter(pk=d['deliverable_id'], project=project).first()
        if not deliverable:
            raise ApiError('Livrable introuvable.')
    channel = d.get('channel') if d.get('channel') in dict(CHANNELS) else 'Interne'
    team = {str(x) for x in project.memberships.values_list('user_id', flat=True)}

    def ids(value):
        if isinstance(value, str):
            value = json.loads(value) if value.strip().startswith('[') else [x for x in value.split(',') if x.strip()]
        return {str(x) for x in (value or [])}

    def allowed(user_ids):
        users = list(User.objects.filter(pk__in=user_ids, is_active=True))
        if len(users) != len(user_ids) or any(str(u.pk) not in team and not u.has_role('ADMIN') for u in users):
            raise ApiError("Choisissez des membres de l'équipe du projet.")
        return users

    try:
        recipients = allowed(ids(d.get('recipient_ids')))
        from_ids = ids(d.get('from_user_id')) if channel == 'Interne' else set()
    except ValueError:
        raise ApiError('Liste de membres invalide.')
    from_user = (allowed(from_ids)[0] if from_ids else request.user) if channel == 'Interne' else None
    with transaction.atomic():
        f = Feedback.objects.create(
            project=project, type=d.get('type') if d.get('type') in dict(TYPES) else 'FEEDBACK',
            deliverable=deliverable, version_number=(int(d['version_number']) if d.get('version_number') else (deliverable.current_version.number if deliverable and deliverable.current_version else None)),
            channel=channel, contact=(d.get('contact') or '').strip() if channel != 'Interne' else '', content=content, author=request.user,
            from_user=from_user,
            date=parse_dt(d.get('date'), 'La date', required=False) or timezone.now(),
        )
        for img in images:
            FeedbackImage.objects.create(feedback=f, file=img, name=img.name)
        f.recipients.set(recipients)
    source = (from_user.name if from_user else f.contact or 'Client')
    href = f'/projects/{project.id}?tab=feedback'
    notify(recipients, 'feedback', 'Retour à traiter pour vous', f'De {source} — {content[:60]}', href, exclude=request.user)
    head = project.head
    if head and head not in recipients:
        notify([head], 'feedback', 'Nouveau retour', f'De {source} — {project.name} — {content[:60]}', href, exclude=request.user)
    return Response(shapes.feedback(f), status=201)


@api_view(['POST'])
def set_status(request, pk):
    f = _get(pk)
    require_manage(request.user, f.project)
    status = request.data.get('status')
    if status not in dict(STATUSES):
        raise ApiError('Statut inconnu.')
    f.status = status
    f.save(update_fields=['status'])
    return Response(shapes.feedback(f))


@api_view(['POST'])
def toggle_cdc(request, pk):
    f = _get(pk)
    require_manage(request.user, f.project)
    f.needs_new_cdc = not f.needs_new_cdc
    f.save(update_fields=['needs_new_cdc'])
    return Response(shapes.feedback(f))


@api_view(['POST'])
def convert(request, pk):
    """CDC-06 : une demande acceptée devient une ou plusieurs tâches, en un geste."""
    f = _get(pk)
    require_manage(request.user, f.project)
    titles = [str(t).strip() for t in request.data.get('titles', []) if str(t).strip()]
    if not titles:
        raise ApiError('Indiquez au moins une tâche.')
    due = timezone.now() + timedelta(days=7)
    with transaction.atomic():
        for title in titles:
            Task.objects.create(
                project=f.project, title=title[:200], due_date=due, labels=['retour client'],
                description=f'Issu du retour du {f.date:%d/%m/%Y} : {f.content}',
            )
        f.status, f.linked_label = 'DONE', f'{len(titles)} tâche(s)'
        f.save(update_fields=['status', 'linked_label'])
    return Response(shapes.feedback(f))
