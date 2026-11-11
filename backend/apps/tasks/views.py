import re

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.core import shapes
from apps.core.access import can_manage, is_member, require_view
from apps.core.errors import ApiError
from apps.notifications.service import notify
from apps.projects.models import Milestone, Sprint
from apps.projects.views import get_project, parse_dt

from .models import PRIORITIES, STATUSES, Task, TaskComment

User = get_user_model()


def get_task(pk) -> Task:
    t = Task.objects.select_related('project', 'parent').prefetch_related('assignees', 'project__memberships').filter(pk=pk).first()
    if not t:
        raise ApiError('Tâche introuvable.', 404)
    return t


def rights(user, task: Task) -> dict:
    """Admin / responsable : tout. Dev membre : ses tâches assignées et les sous-tâches de ses tâches."""
    manage = can_manage(user, task.project)
    assigned = task.assignees.filter(pk=user.pk).exists()
    owns_parent = bool(task.parent_id and task.parent.assignees.filter(pk=user.pk).exists())
    return {'edit': manage or owns_parent, 'update': manage or assigned, 'log': manage or assigned}


def _notify_assigned(task: Task, user_ids, actor):
    notify(user_ids, 'task', 'Tâche assignée', f'{task.title} — {task.project.name}', f'/projects/{task.project_id}/sprints', exclude=actor)


@api_view(['POST'])
def create_task(request):
    d = request.data
    project = get_project(d.get('project_id'))
    parent = Task.objects.filter(pk=d.get('parent_id'), project=project).first() if d.get('parent_id') else None
    if d.get('parent_id') and not parent:
        raise ApiError('Tâche parente introuvable.')
    if parent and parent.parent_id:
        raise ApiError('Un seul niveau de sous-tâches (TSK-03).')
    # Le responsable / l'admin crée les tâches ; un dev membre crée des sous-tâches de ses propres tâches.
    if not (can_manage(request.user, project) or (parent and parent.assignees.filter(pk=request.user.pk).exists())):
        raise ApiError("Seuls l'admin et le responsable créent des tâches.", 403)
    title = (d.get('title') or '').strip()
    if not title:
        raise ApiError('Le titre est obligatoire.')
    member_ids = {str(x) for x in project.memberships.values_list('user_id', flat=True)}
    assignees = [a for a in d.get('assignees') or [] if str(a) in member_ids]
    with transaction.atomic():
        task = Task.objects.create(
            project=project, parent=parent, title=title, description=d.get('description', ''),
            due_date=parse_dt(d.get('due_date'), "L'échéance"), priority=d.get('priority') if d.get('priority') in dict(PRIORITIES) else 'MEDIUM',
            milestone=Milestone.objects.filter(pk=d.get('milestone_id'), project=project).first() if d.get('milestone_id') else None,
            sprint=Sprint.objects.filter(pk=d.get('sprint_id'), project=project).exclude(status='CLOSED').first() if d.get('sprint_id') else (parent.sprint if parent else None),
            labels=d.get('labels', []),
        )
        task.assignees.set(assignees)
    _notify_assigned(task, assignees, request.user)
    return Response(shapes.task(task), status=201)


@api_view(['PATCH', 'DELETE'])
def update_task(request, pk):
    task = get_task(pk)
    r = rights(request.user, task)
    if request.method == 'DELETE':
        if not r['edit']:
            raise ApiError('Suppression non autorisée.', 403)
        task.delete()
        return Response({'ok': True})

    d = request.data
    planning = {'title', 'description', 'due_date', 'priority', 'milestone_id', 'sprint_id', 'assignees', 'labels'}
    if planning & set(d.keys()) and not r['edit']:
        raise ApiError("Seuls l'admin et le responsable modifient cette tâche.", 403)
    project = task.project
    if 'title' in d:
        task.title = (d['title'] or '').strip() or task.title
    if 'description' in d:
        task.description = d['description']
    if 'due_date' in d:
        task.due_date = parse_dt(d['due_date'], "L'échéance")
    if 'priority' in d and d['priority'] in dict(PRIORITIES):
        task.priority = d['priority']
    if 'labels' in d:
        task.labels = d['labels']
    if 'milestone_id' in d:
        task.milestone = Milestone.objects.filter(pk=d['milestone_id'], project=project).first() if d['milestone_id'] else None
    if 'sprint_id' in d:
        # MIL-04 : planifier = déplacer vers un sprint (non clôturé) ou le backlog ; les sous-tâches suivent.
        sprint = Sprint.objects.filter(pk=d['sprint_id'], project=project).first() if d['sprint_id'] else None
        if sprint and sprint.status == 'CLOSED':
            raise ApiError('Ce sprint est clôturé : il ne reçoit plus de tâches.')
        task.sprint = sprint
        task.subtasks.update(sprint=sprint)
    new_assignees = None
    if 'assignees' in d:
        member_ids = {str(x) for x in project.memberships.values_list('user_id', flat=True)}
        ids = [a for a in d['assignees'] if str(a) in member_ids]
        if not ids:
            raise ApiError('Au moins un assigné.')
        before = {str(x) for x in task.assignees.values_list('pk', flat=True)}
        task.assignees.set(ids)
        new_assignees = [a for a in ids if str(a) not in before]
    task.save()
    if new_assignees:
        _notify_assigned(task, new_assignees, request.user)
    return Response(shapes.task(task))


@api_view(['POST'])
def set_status(request, pk):
    """TSK-02/04 : DONE force 100 % ; quitter DONE restaure la dernière valeur < 100 ; BLOCKED exige un motif."""
    task = get_task(pk)
    if not rights(request.user, task)['update']:
        raise ApiError('Vous ne pouvez mettre à jour que vos tâches.', 403)
    status, reason = request.data.get('status'), (request.data.get('reason') or '').strip()
    if status not in dict(STATUSES):
        raise ApiError('Statut inconnu.')
    if status == 'BLOCKED' and not reason:
        raise ApiError('Le motif du blocage est obligatoire.')
    if status == 'DONE':
        if task.progress < 100:
            task.last_progress_below_100 = task.progress
        task.progress = 100
    elif task.status == 'DONE':
        task.progress = task.last_progress_below_100
    task.status = status
    task.blocked_reason = reason if status == 'BLOCKED' else ''
    task.save()
    return Response(shapes.task(task))


@api_view(['POST'])
def set_progress(request, pk):
    """TSK-04 : curseur par pas de 10 ; 100 % passe la tâche en DONE."""
    task = get_task(pk)
    if not rights(request.user, task)['update']:
        raise ApiError('Vous ne pouvez mettre à jour que vos tâches.', 403)
    if task.subtasks.exclude(status='CANCELLED').exists():
        raise ApiError("L'avancement d'une tâche avec sous-tâches est calculé.")
    try:
        value = int(request.data.get('value'))
    except (TypeError, ValueError):
        raise ApiError('Avancement invalide.')
    value = max(0, min(100, round(value / 10) * 10))
    if value >= 100:
        if task.progress < 100:
            task.last_progress_below_100 = task.progress
        task.progress, task.status = 100, 'DONE'
    else:
        task.progress, task.last_progress_below_100 = value, value
        if task.status == 'DONE' or (task.status == 'TODO' and value > 0):
            task.status = 'IN_PROGRESS'
    task.save()
    return Response(shapes.task(task))


MENTION = re.compile(r'@([\wÀ-ÿ]+(?: [\wÀ-ÿ]+)?)')


@api_view(['POST'])
def add_comment(request, pk):
    """TSK-05 : commentaire avec mentions @membre (notification)."""
    task = get_task(pk)
    require_view(request.user, task.project)
    if not (can_manage(request.user, task.project) or is_member(task.project, request.user)):
        raise ApiError("Vous n'êtes pas membre de ce projet.", 403)
    body = (request.data.get('body') or '').strip()
    if not body:
        raise ApiError('Le commentaire est vide.')
    comment = TaskComment.objects.create(task=task, user=request.user, body=body)
    members = User.objects.filter(memberships__project=task.project)
    mentioned = {u.pk for u in members for name in MENTION.findall(body) if u.name.lower().startswith(name.lower())}
    notify(mentioned, 'mention', f'{request.user.name.split()[0]} vous a mentionné', task.title, f'/projects/{task.project_id}/sprints', exclude=request.user)
    others = set(task.assignees.values_list('pk', flat=True)) - mentioned
    notify(others, 'task', 'Nouveau commentaire', task.title, f'/projects/{task.project_id}/sprints', exclude=request.user)
    return Response(shapes.comment(comment), status=201)
