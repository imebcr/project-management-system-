"""Matrice v1.1 : Admin · Responsable du projet · Dev membre — vérifiée par appels API directs."""
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.projects.models import ProjectMembership
from apps.tasks.models import Task

pytestmark = pytest.mark.django_db
SOON = (timezone.now() + timedelta(days=5)).isoformat()


def test_only_admin_creates_projects(api, admin, head, member):
    body = {'name': 'Nouveau', 'clientName': 'Client', 'type': 'web', 'startDate': timezone.now().isoformat(), 'dueDate': SOON}
    assert api(head).post('/api/projects', body, format='json').status_code == 403
    assert api(member).post('/api/projects', body, format='json').status_code == 403
    r = api(admin).post('/api/projects', body, format='json')
    assert r.status_code == 201 and r.json()['clientName'] == 'Client'


def test_project_type_is_mobile_or_web(api, admin):
    r = api(admin).post('/api/projects', {'name': 'X', 'clientName': 'C', 'type': 'design', 'startDate': timezone.now().isoformat(), 'dueDate': SOON}, format='json')
    assert r.status_code == 400


@pytest.mark.parametrize('who, code', [('admin', 200), ('head', 200), ('member', 403), ('outsider', 403)])
def test_status_transitions_admin_or_head(api, project, who, code, request):
    r = api(request.getfixturevalue(who)).post(f'/api/projects/{project.id}/transition', {'status': 'DELIVERED'}, format='json')
    assert r.status_code == code


def test_invalid_transition_rejected(api, admin, project):
    r = api(admin).post(f'/api/projects/{project.id}/transition', {'status': 'DRAFT'}, format='json')
    assert r.status_code == 400


def test_on_hold_requires_reason(api, admin, project):
    assert api(admin).post(f'/api/projects/{project.id}/transition', {'status': 'ON_HOLD'}, format='json').status_code == 400
    assert api(admin).post(f'/api/projects/{project.id}/transition', {'status': 'ON_HOLD', 'reason': 'Client'}, format='json').status_code == 200


def test_head_manages_team_but_not_head_role(api, project, head, outsider):
    assert api(head).post(f'/api/projects/{project.id}/members', {'userId': str(outsider.id), 'role': 'CONTRIBUTOR'}, format='json').status_code == 200
    assert api(head).post(f'/api/projects/{project.id}/members', {'userId': str(outsider.id), 'role': 'HEAD'}, format='json').status_code == 403
    assert api(head).delete(f'/api/projects/{project.id}/members/{head.id}').status_code == 403


def test_member_cannot_manage_team(api, project, member, outsider):
    assert api(member).post(f'/api/projects/{project.id}/members', {'userId': str(outsider.id)}, format='json').status_code == 403


def test_task_creation_rights(api, project, head, member, outsider):
    body = {'projectId': str(project.id), 'title': 'Écran login', 'dueDate': SOON, 'assignees': [str(member.id)]}
    assert api(member).post('/api/tasks', body, format='json').status_code == 403
    assert api(outsider).post('/api/tasks', body, format='json').status_code == 403
    r = api(head).post('/api/tasks', body, format='json')
    assert r.status_code == 201
    # Un dev membre crée des sous-tâches de ses propres tâches (TSK-03).
    sub = {'projectId': str(project.id), 'parentId': r.json()['id'], 'title': 'Sous-tâche', 'dueDate': SOON}
    assert api(member).post('/api/tasks', sub, format='json').status_code == 201


def test_member_updates_only_assigned_tasks(api, project, member, head):
    mine = Task.objects.create(project=project, title='À moi', due_date=timezone.now())
    mine.assignees.set([member])
    theirs = Task.objects.create(project=project, title='Pas à moi', due_date=timezone.now())
    theirs.assignees.set([head])
    assert api(member).post(f'/api/tasks/{mine.id}/progress', {'value': 40}, format='json').status_code == 200
    assert api(member).post(f'/api/tasks/{theirs.id}/progress', {'value': 40}, format='json').status_code == 403
    assert api(member).patch(f'/api/tasks/{mine.id}', {'title': 'Renommée'}, format='json').status_code == 403


def test_deliverable_sharing_head_only(api, deliverable, head, member):
    assert api(member).post(f'/api/deliverables/{deliverable.id}/link').status_code == 403
    r = api(head).post(f'/api/deliverables/{deliverable.id}/link')
    assert r.status_code == 201 and r.json()['url'].endswith(r.json()['token'])
    # « Copier le lien » réutilise le lien actif de la version courante.
    again = api(head).post(f'/api/deliverables/{deliverable.id}/link')
    assert again.status_code == 200 and again.json()['token'] == r.json()['token']


def test_member_cannot_create_folder(api, project, member, head):
    assert api(member).post('/api/folders', {'projectId': str(project.id), 'name': 'X'}, format='json').status_code == 403
    assert api(head).post('/api/folders', {'projectId': str(project.id), 'name': 'X'}, format='json').status_code == 201


def test_feedback_by_any_member(api, project, member, outsider, head):
    body = {'projectId': str(project.id), 'type': 'BUG', 'content': 'Crash au démarrage'}
    assert api(outsider).post('/api/feedback', body, format='multipart').status_code == 403
    r = api(member).post('/api/feedback', body, format='multipart')
    assert r.status_code == 201
    assert head.notifications.filter(kind='feedback').exists()


def test_only_admin_designates_head_and_head_is_notified(api, admin, project, member, head):
    r = api(admin).post(f'/api/projects/{project.id}/members', {'userId': str(member.id), 'role': 'HEAD'}, format='json')
    assert r.status_code == 200
    roles = dict(ProjectMembership.objects.filter(project=project).values_list('user__email', 'role'))
    assert roles == {member.email: 'HEAD', head.email: 'CONTRIBUTOR'}
    assert member.notifications.filter(title__icontains='responsable').exists()
