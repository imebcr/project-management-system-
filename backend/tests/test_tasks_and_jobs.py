"""Règles des tâches (TSK-04/06, MIL-05) et tâches planifiées."""
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.deliverables.models import Deliverable
from apps.infra.models import Domain, Server
from apps.notifications import tasks as jobs
from apps.notifications.models import Notification
from apps.projects.models import Sprint
from apps.tasks.models import Task
from apps.tasks.progress import ProgressIndex

pytestmark = pytest.mark.django_db


def test_done_forces_100_and_restores_previous(api, project, head):
    t = Task.objects.create(project=project, title='T', due_date=timezone.now(), progress=60, status='IN_PROGRESS')
    c = api(head)
    assert c.post(f'/api/tasks/{t.id}/status', {'status': 'DONE'}, format='json').json()['progress'] == 100
    assert c.post(f'/api/tasks/{t.id}/status', {'status': 'IN_PROGRESS'}, format='json').json()['progress'] == 60
    assert c.post(f'/api/tasks/{t.id}/status', {'status': 'BLOCKED'}, format='json').status_code == 400


def test_progress_equal_weights(project):
    """Plus d'estimation : chaque tâche compte pareil ; les tâches annulées sont exclues."""
    parent = Task.objects.create(project=project, title='Parent', due_date=timezone.now())
    Task.objects.create(project=project, parent=parent, title='A', due_date=timezone.now(), status='DONE')
    Task.objects.create(project=project, parent=parent, title='B', due_date=timezone.now(), progress=50)
    Task.objects.create(project=project, parent=parent, title='C', due_date=timezone.now(), status='CANCELLED')
    Task.objects.create(project=project, title='Autre', due_date=timezone.now(), progress=0)
    idx = ProgressIndex(project.tasks.all())
    assert idx.task(parent) == 75
    assert idx.project(project.id) == round((75 + 0) / 2)


def test_close_sprint_moves_unfinished(api, project, head):
    s1 = Sprint.objects.create(project=project, name='S1', start_date=timezone.now(), end_date=timezone.now(), status='ACTIVE')
    s2 = Sprint.objects.create(project=project, name='S2', start_date=timezone.now(), end_date=timezone.now())
    done = Task.objects.create(project=project, title='Fini', due_date=timezone.now(), sprint=s1, status='DONE')
    open_ = Task.objects.create(project=project, title='Ouvert', due_date=timezone.now(), sprint=s1)
    assert api(head).post(f'/api/sprints/{s1.id}/close', {'moveTo': str(s2.id)}, format='json').status_code == 200
    done.refresh_from_db(), open_.refresh_from_db()
    assert done.sprint_id == s1.id and open_.sprint_id == s2.id
    assert api(head).post(f'/api/sprints/{s2.id}/start').status_code == 200


def test_only_one_active_sprint(api, project, head):
    Sprint.objects.create(project=project, name='S1', start_date=timezone.now(), end_date=timezone.now(), status='ACTIVE')
    s2 = Sprint.objects.create(project=project, name='S2', start_date=timezone.now(), end_date=timezone.now())
    assert api(head).post(f'/api/sprints/{s2.id}/start').status_code == 400


def test_due_reminders_to_head_once_per_day(project, head):
    Deliverable.objects.create(project=project, folder=project.folders.first(), name='APK', due_date=timezone.now() + timedelta(days=1))
    assert jobs.due_reminders() >= 1
    assert jobs.due_reminders() == 0
    assert Notification.objects.filter(recipient=head, title='Livrable dû demain').count() == 1


def test_expiry_alerts_7_3_1_days_to_admins_and_project_head(admin, head, member, project):
    from apps.infra.models import Subscription
    Domain.objects.create(name='client.dz', project=project, expires_at=timezone.now() + timedelta(days=14))   # J-14 : plus d'alerte
    srv = Server.objects.create(label='srv', provider='Hetzner', host='1.2.3.4', last_backup=timezone.now() - timedelta(days=3), backup_frequency_days=1)
    srv.projects.add(project)
    for days, offer in ((7, 'J7'), (3, 'J3'), (1, 'J1'), (5, 'J5')):
        Subscription.objects.create(provider='Hetzner', offer=offer, server=srv, renewal_date=timezone.now() + timedelta(days=days, hours=1))
    jobs.expiry_alerts()
    jobs.backup_alerts()
    expiry = Notification.objects.filter(recipient=admin, kind='expiry')
    assert expiry.count() == 3 and not expiry.filter(body__contains='client.dz').exists() and not expiry.filter(body__contains='J5').exists()
    assert Notification.objects.filter(recipient=head, kind='expiry').count() == 3      # chef du projet hébergé
    assert not Notification.objects.filter(recipient=member, kind='expiry').exists()
    assert Notification.objects.filter(recipient=admin, kind='backup').count() == 1
    assert not Notification.objects.filter(recipient=head, kind='backup').exists()
