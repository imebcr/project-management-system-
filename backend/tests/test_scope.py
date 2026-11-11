"""Portée des données : infra admin seul, /bootstrap filtré, agenda, un seul HEAD."""
from datetime import timedelta

import pytest
from django.db import IntegrityError
from django.utils import timezone

from apps.deliverables.models import Deliverable
from apps.infra.models import Server, Subscription
from apps.projects.models import ProjectMembership, Sprint
from apps.tasks.models import Task
from apps.vault.models import VaultEntry

pytestmark = pytest.mark.django_db
INFRA = ['/api/servers', '/api/expiries']


@pytest.mark.parametrize('url', INFRA)
def test_infra_forbidden_to_devs(api, head, member, url):
    """Critère 11 : un dev reçoit 403 sur infra, même responsable de projet."""
    assert api(member).get(url).status_code == 403
    assert api(head).get(url).status_code == 403


@pytest.mark.parametrize('url', INFRA)
def test_infra_open_to_admin(api, admin, url):
    assert api(admin).get(url).status_code == 200


def test_infra_mutations_forbidden_to_devs(api, head):
    server = Server.objects.create(label='srv', provider='Hetzner', host='1.2.3.4')
    sub = Subscription.objects.create(provider='Hetzner', renewal_date=timezone.now())
    assert api(head).post(f'/api/servers/{server.id}/backup').status_code == 403
    assert api(head).post(f'/api/subscriptions/{sub.id}/renew').status_code == 403
    assert api(head).post('/api/servers', {'label': 'x', 'host': 'y', 'type': 'VPS'}, format='json').status_code == 403


def test_bootstrap_scope_for_dev(api, project, other_project, member, admin):
    Server.objects.create(label='srv', provider='Hetzner', host='1.2.3.4')
    entry = VaultEntry(category='SERVER', label='SSH', project=other_project)
    entry.set_secret('super-secret')
    entry.save()
    data = api(member).get('/api/bootstrap').json()
    assert [p['id'] for p in data['projects']] == [str(project.id)]
    assert data['servers'] == [] and data['invitations'] == [] and data['auditLog'] == []
    assert data['vaultEntries'] == []
    assert 'super-secret' not in str(api(admin).get('/api/bootstrap').json())


def test_one_head_per_project_constraint(project, member):
    with pytest.raises(IntegrityError):
        ProjectMembership.objects.filter(project=project, user=member).update(role='HEAD')


def test_agenda_scope(api, project, head, member, admin):
    """Un dev non chef ne voit que ses tâches (et ses réunions) ; le chef voit aussi livrables et sprints ; l'admin voit tout."""
    soon = timezone.now() + timedelta(days=3)
    t = Task.objects.create(project=project, title='Tâche', due_date=soon)
    t.assignees.set([member, head])
    Deliverable.objects.create(project=project, folder=project.folders.first(), name='APK', due_date=soon)
    Sprint.objects.create(project=project, name='S1', start_date=timezone.now(), end_date=soon)
    q = f'/api/me/agenda?from={timezone.localdate()}&to={timezone.localdate() + timedelta(days=10)}'
    assert {i['type'] for i in api(member).get(q).json()} == {'TASK'}
    assert {'TASK', 'DELIVERABLE', 'SPRINT_START', 'SPRINT_END'} <= {i['type'] for i in api(head).get(q).json()}
    everything = api(admin).get(q).json()
    assert {'TASK', 'DELIVERABLE', 'SPRINT_START', 'SPRINT_END'} <= {i['type'] for i in everything}
    task = next(i for i in everything if i['type'] == 'TASK')
    assert set(task['people']) == {str(member.id), str(head.id)}
