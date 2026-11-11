import json
import re
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.audit.models import audit
from apps.cdc.models import CdcVersion
from apps.core import shapes
from apps.core.access import can_manage, is_admin, require_admin, require_manage, require_view
from apps.core.errors import ApiError
from apps.deliverables.models import DEFAULT_FOLDERS, Folder
from apps.notifications.service import notify

from .models import Meeting, Milestone, Note, Project, ProjectMembership, Sprint, can_transition

User = get_user_model()


def get_project(pk) -> Project:
    project = Project.objects.prefetch_related('memberships').filter(pk=pk).first()
    if not project:
        raise ApiError('Projet introuvable.', 404)
    return project


def parse_dt(value, field: str, required=True):
    if not value:
        if required:
            raise ApiError(f'{field} est obligatoire.')
        return None
    dt = parse_datetime(value) if 'T' in str(value) else parse_datetime(f'{value}T09:00:00Z')
    if dt is None:
        raise ApiError(f'{field} : date invalide.')
    return dt if dt.tzinfo else timezone.make_aware(dt)


def _head_notice(project, user_id):
    notify([user_id], 'task', 'Vous êtes responsable d’un projet',
           f"{project.name} — vous fixez les sprints et jalons, choisissez l'équipe et assignez les tâches.", f'/projects/{project.id}')


# ---------- Projets ----------

def _clean_phone(value) -> str:
    """Téléphone du client (optionnel) : chiffres, espaces, +, -, (), points ; 6 chiffres au moins."""
    phone = (value or '').strip()
    if not phone:
        return ''
    if not re.fullmatch(r'[0-9+()\-. ]{6,40}', phone) or sum(c.isdigit() for c in phone) < 6:
        raise ApiError('Numéro de téléphone du client invalide.')
    return phone


@api_view(['POST'])
def create_project(request):
    """PRJ-01 v1.2 : admin seul ; client saisi librement ; type mobile ou web ; CDC optionnel déposé à la création."""
    require_admin(request.user)
    d = request.data
    name, client = (d.get('name') or '').strip(), (d.get('client_name') or '').strip()
    if not name:
        raise ApiError('Le nom du projet est obligatoire.')
    if not client:
        raise ApiError('Le nom du client est obligatoire.')
    ptype = d.get('type', 'mobile')
    if ptype not in ('mobile', 'web'):
        raise ApiError('Type de projet : mobile ou web.')
    start, due = parse_dt(d.get('start_date'), 'La date de début'), parse_dt(d.get('due_date'), 'La livraison prévue')
    if due < start:
        raise ApiError('La livraison prévue doit suivre la date de début.')
    phone = _clean_phone(d.get('client_phone'))
    head_id = d.get('head_id') or None
    head = User.objects.filter(pk=head_id, is_active=True).first() if head_id else None
    if head_id and not head:
        raise ApiError('Responsable introuvable.')
    # Équipe choisie dès la création (liste JSON en multipart, ou liste en JSON).
    raw = d.get('member_ids') or []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw) if raw.strip().startswith('[') else [x for x in raw.split(',') if x.strip()]
        except ValueError:
            raise ApiError("Liste de l'équipe invalide.")
    members = list(User.objects.filter(pk__in=[str(x) for x in raw], is_active=True).exclude(pk=head.pk if head else None))
    if len(members) != len({str(x) for x in raw} - ({str(head.pk)} if head else set())):
        raise ApiError("Un membre choisi est introuvable ou désactivé.")

    with transaction.atomic():
        project = Project.objects.create(
            code=Project.next_code(), name=name, client_name=client, client_phone=phone, type=ptype, start_date=start, due_date=due,
            description=d.get('description', ''),
        )
        if head:
            ProjectMembership.objects.create(project=project, user=head, role='HEAD')
        ProjectMembership.objects.bulk_create([ProjectMembership(project=project, user=u, role='CONTRIBUTOR') for u in members])
        Folder.objects.bulk_create([Folder(project=project, name=n) for n in DEFAULT_FOLDERS])
        cdc_file = request.FILES.get('cdc_file')
        if cdc_file:
            CdcVersion.objects.create(
                project=project, number=1, file=cdc_file, file_name=cdc_file.name, author=request.user,
                status='ACCEPTED' if str(d.get('cdc_accepted')).lower() in ('1', 'true') else 'DRAFT',
                delay_days=max(1, round((due - start).total_seconds() / 86400)),
                change_summary='Version initiale, déposée à la création du projet.',
            )
        audit(request.user, 'PROJECT_CREATE', project.name, project)
    if head and head.pk != request.user.pk:
        _head_notice(project, head.pk)
    notify([u.pk for u in members], 'task', 'Nouveau projet', f'Vous faites partie de l’équipe de {project.name}.', f'/projects/{project.id}', exclude=request.user)
    return Response(shapes.project(get_project(project.pk)), status=201)


@api_view(['PATCH'])
def update_project(request, pk):
    project = get_project(pk)
    require_admin(request.user)
    d = request.data
    if 'client_phone' in d:
        project.client_phone = _clean_phone(d.get('client_phone'))
    for field in ('name', 'client_name', 'description'):
        if field in d:
            setattr(project, field, (d[field] or '').strip())
    if 'type' in d and d['type'] in ('mobile', 'web'):
        project.type = d['type']
    if 'start_date' in d:
        project.start_date = parse_dt(d['start_date'], 'La date de début')
    if 'due_date' in d:
        project.due_date = parse_dt(d['due_date'], 'La livraison prévue')
    project.save()
    return Response(shapes.project(project))


@api_view(['POST'])
def transition_project(request, pk):
    """PRJ-02 : l'admin ou le chef de projet change l'étape du projet ; ON_HOLD exige un motif."""
    project = get_project(pk)
    require_manage(request.user, project)
    target, reason = request.data.get('status'), (request.data.get('reason') or '').strip()
    if not can_transition(project.status, target):
        raise ApiError('Transition impossible depuis ce statut.')
    if target == 'ON_HOLD' and not reason:
        raise ApiError('Le motif de mise en pause est obligatoire.')
    project.status, project.hold_reason = target, reason if target == 'ON_HOLD' else ''
    project.save()
    audit(request.user, 'PROJECT_ARCHIVE' if target == 'ARCHIVED' else 'PROJECT_STATUS', f'{project.name} → {target}', project)
    return Response(shapes.project(project))


@api_view(['POST'])
def set_servers(request, pk):
    """Le chef de projet (ou l'admin) choisit, dans la liste des serveurs de l'agence, ceux qui hébergent le projet."""
    from apps.infra.models import Server
    project = get_project(pk)
    require_manage(request.user, project)
    ids = {str(x) for x in (request.data.get('server_ids') or [])}
    servers = list(Server.objects.filter(pk__in=ids).exclude(state='DECOMMISSIONED'))
    if len(servers) != len(ids):
        raise ApiError('Serveur introuvable ou hors service.')
    project.servers.set(servers)
    audit(request.user, 'PROJECT_SERVERS', f"{project.name} → {', '.join(s.label for s in servers) or 'aucun'}", project)
    return Response(shapes.project(get_project(pk)))


@api_view(['POST', 'DELETE'])
def set_member(request, pk, user_id=None):
    """
    PRJ-06 v1.1 : le responsable (ou l'admin) compose l'équipe ; seul l'admin désigne, change
    ou retire le responsable. Un seul HEAD par projet (contrainte en base).
    """
    project = get_project(pk)
    require_manage(request.user, project)
    target_id = user_id or request.data.get('user_id')
    role = None if request.method == 'DELETE' else request.data.get('role', 'CONTRIBUTOR')
    if role not in (None, 'HEAD', 'CONTRIBUTOR'):
        raise ApiError('Rôle de projet inconnu.')
    target = User.objects.filter(pk=target_id).first()
    if not target:
        raise ApiError('Utilisateur introuvable.', 404)
    current = project.memberships.filter(user=target).first()
    touches_head = role == 'HEAD' or (current and current.role == 'HEAD')
    if touches_head and not is_admin(request.user):
        raise ApiError("Seul l'admin désigne ou retire le responsable.", 403)

    with transaction.atomic():
        if role == 'HEAD':
            project.memberships.filter(role='HEAD').exclude(user=target).update(role='CONTRIBUTOR')
        if role is None:
            project.memberships.filter(user=target).delete()
        else:
            ProjectMembership.objects.update_or_create(project=project, user=target, defaults={'role': role})
        if role == 'HEAD':
            audit(request.user, 'PROJECT_HEAD', f'{project.name} → {target.name}', project)
    if role == 'HEAD' and target.pk != request.user.pk:
        _head_notice(project, target.pk)
    project.save(update_fields=['updated_at'])
    return Response(shapes.project(get_project(pk)))


# ---------- Jalons (MIL-01) ----------

@api_view(['POST'])
def create_milestone(request):
    project = get_project(request.data.get('project_id'))
    require_manage(request.user, project)
    order = project.milestones.count() + 1
    m = Milestone.objects.create(
        project=project, name=(request.data.get('name') or '').strip() or 'Jalon', description=request.data.get('description', ''),
        target_date=parse_dt(request.data.get('target_date'), 'La date cible'), order=order,
    )
    return Response(shapes.milestone(m), status=201)


@api_view(['PATCH'])
def update_milestone(request, pk):
    m = Milestone.objects.select_related('project').filter(pk=pk).first()
    if not m:
        raise ApiError('Jalon introuvable.', 404)
    require_manage(request.user, m.project)
    if 'status' in request.data:
        if request.data['status'] not in dict(Milestone.STATUSES):
            raise ApiError('Statut inconnu.')
        m.status = request.data['status']
    for field in ('name', 'description'):
        if field in request.data:
            setattr(m, field, request.data[field])
    if 'target_date' in request.data:
        m.target_date = parse_dt(request.data['target_date'], 'La date cible')
    m.save()
    return Response(shapes.milestone(m))


# ---------- Sprints (MIL-02 / MIL-04 / MIL-05) ----------

@api_view(['POST'])
def create_sprint(request):
    project = get_project(request.data.get('project_id'))
    require_manage(request.user, project)
    start = parse_dt(request.data.get('start_date'), 'La date de début')
    end = parse_dt(request.data.get('end_date'), 'La date de fin', required=False) or start + timedelta(days=14)
    if end < start:
        raise ApiError('La date de fin doit suivre la date de début.')
    name = (request.data.get('name') or '').strip() or f'Sprint {project.sprints.count() + 1}'
    s = Sprint.objects.create(project=project, name=name, goal=request.data.get('goal', ''), start_date=start, end_date=end)
    return Response(shapes.sprint(s), status=201)


def _get_sprint(pk) -> Sprint:
    s = Sprint.objects.select_related('project').filter(pk=pk).first()
    if not s:
        raise ApiError('Sprint introuvable.', 404)
    return s


@api_view(['PATCH'])
def update_sprint(request, pk):
    s = _get_sprint(pk)
    require_manage(request.user, s.project)
    if s.status == 'CLOSED':
        raise ApiError('Ce sprint est clôturé.')
    for field in ('name', 'goal'):
        if field in request.data:
            setattr(s, field, request.data[field])
    if 'start_date' in request.data:
        s.start_date = parse_dt(request.data['start_date'], 'La date de début')
    if 'end_date' in request.data:
        s.end_date = parse_dt(request.data['end_date'], 'La date de fin')
    if s.end_date < s.start_date:
        raise ApiError('La date de fin doit suivre la date de début.')
    s.save()
    return Response(shapes.sprint(s))


@api_view(['POST'])
def start_sprint(request, pk):
    s = _get_sprint(pk)
    require_manage(request.user, s.project)
    if s.status != 'PLANNED':
        raise ApiError('Seul un sprint planifié peut démarrer.')
    s.status = 'ACTIVE'
    try:
        with transaction.atomic():
            s.save()
    except IntegrityError:
        raise ApiError('Un seul sprint actif par projet (MIL-02).')
    return Response(shapes.sprint(s))


@api_view(['POST'])
def close_sprint(request, pk):
    """MIL-05 : les tâches non terminées partent vers le sprint suivant ou le backlog."""
    s = _get_sprint(pk)
    require_manage(request.user, s.project)
    move_to = request.data.get('move_to') or None
    target = None
    if move_to:
        target = Sprint.objects.filter(pk=move_to, project=s.project).exclude(status='CLOSED').first()
        if not target:
            raise ApiError('Sprint de destination invalide.')
    with transaction.atomic():
        s.tasks.exclude(status__in=['DONE', 'CANCELLED']).update(sprint=target)
        s.status = 'CLOSED'
        s.save()
    return Response(shapes.sprint(s))


# ---------- Réunions et notes ----------

@api_view(['POST'])
def create_note(request):
    """COL-01 : toute l'équipe ou des membres précis ; les destinataires sont notifiés."""
    project = get_project(request.data.get('project_id'))
    if not (is_admin(request.user) or project.memberships.filter(user=request.user).exists()):
        raise ApiError("Vous n'êtes pas membre de ce projet.", 403)
    content = (request.data.get('content') or '').strip()
    if not content:
        raise ApiError('La note est vide.')
    audience = request.data.get('audience', 'TEAM')
    note = Note.objects.create(project=project, author=request.user, content=content, audience_team=audience == 'TEAM')
    if audience == 'TEAM':
        recipients = [m.user_id for m in project.memberships.all()]
    else:
        recipients = list(project.memberships.filter(user_id__in=audience).values_list('user_id', flat=True))
        note.recipients.set(recipients)
    notify(recipients, 'note', f'Nouvelle note de {request.user.name.split()[0]}', project.name, f'/projects/{project.id}?tab=notes', exclude=request.user)
    return Response(shapes.note(note), status=201)


@api_view(['POST'])
def toggle_pin(request, pk):
    note = Note.objects.select_related('project').filter(pk=pk).first()
    if not note:
        raise ApiError('Note introuvable.', 404)
    if not (can_manage(request.user, note.project) or note.author_id == request.user.pk):
        raise ApiError("Seuls l'auteur, le responsable et l'admin épinglent une note.", 403)
    note.pinned = not note.pinned
    note.save(update_fields=['pinned'])
    return Response(shapes.note(note))
