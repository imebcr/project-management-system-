from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.deliverables.models import Deliverable, DeliverableVersion, Folder
from apps.projects.models import Project, ProjectMembership

PASSWORD = 'Zidny2026!'


@pytest.fixture(autouse=True)
def isolated_cache(settings):
    """Cache mémoire par test : les compteurs (verrouillage, limitation) ne fuient pas d'un test à l'autre."""
    settings.CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
    from django.core.cache import cache

    cache.clear()
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.EMAIL_SYNC = True


def make_user(email, role='DEV', **extra):
    return User.objects.create_user(email=email, password=PASSWORD, name=email.split('@')[0].title(), role=role, **extra)


@pytest.fixture
def admin(db):
    return make_user('admin@zidny.dz', 'ADMIN')


@pytest.fixture
def head(db):
    return make_user('head@zidny.dz')


@pytest.fixture
def member(db):
    return make_user('member@zidny.dz')


@pytest.fixture
def outsider(db):
    return make_user('outsider@zidny.dz')


@pytest.fixture
def project(db, head, member):
    p = Project.objects.create(code='ZD-2026-900', name='App test', client_name='Client test', type='mobile', status='ACTIVE',
                               start_date=timezone.now() - timedelta(days=10), due_date=timezone.now() + timedelta(days=30))
    ProjectMembership.objects.create(project=p, user=head, role='HEAD')
    ProjectMembership.objects.create(project=p, user=member, role='CONTRIBUTOR')
    Folder.objects.create(project=p, name='Builds')
    return p


@pytest.fixture
def other_project(db, outsider):
    p = Project.objects.create(code='ZD-2026-901', name='Autre projet', client_name='Autre client', type='web', status='ACTIVE',
                               start_date=timezone.now(), due_date=timezone.now() + timedelta(days=30))
    ProjectMembership.objects.create(project=p, user=outsider, role='HEAD')
    return p


@pytest.fixture
def deliverable(project, head):
    d = Deliverable.objects.create(project=project, folder=project.folders.first(), name='APK Android')
    DeliverableVersion.objects.create(deliverable=d, number=1, key='tests/app.apk', file_name='app.apk', size=1234, uploader=head)
    return d


def client_for(user=None) -> APIClient:
    c = APIClient()
    if user:
        c.force_authenticate(user)
    return c


@pytest.fixture
def api():
    return client_for
