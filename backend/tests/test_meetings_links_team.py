"""Réunions planifiées (notification + rappel 3 h), livrables en lien, équipe à la création, type de serveur libre."""
from datetime import timedelta
from django.utils import timezone

from apps.notifications.models import Notification
from apps.projects.meetings import send_due_reminders
from apps.projects.models import Meeting, ProjectMembership


def iso(dt):
    return dt.isoformat()


# ---------- Réunions ----------

def test_schedule_meeting_notifies_and_emails_attendees(api, project, head, member, outsider, mailoutbox, django_capture_on_commit_callbacks):
    when = timezone.now() + timedelta(days=2)
    with django_capture_on_commit_callbacks(execute=True):
        r = api(head).post('/api/meetings', {
            'projectId': str(project.id), 'title': 'Point client', 'date': iso(when), 'durationMinutes': 45,
            'location': 'Google Meet', 'attendees': [str(head.id), str(member.id)],
        }, format='json')
    assert r.status_code == 201, r.json()
    body = r.json()
    assert body['durationMinutes'] == 45 and body['location'] == 'Google Meet'
    # Le participant est notifié (pas l'auteur) et reçoit un e-mail
    assert Notification.objects.filter(recipient=member, kind='meeting', title__startswith='Réunion planifiée').count() == 1
    assert not Notification.objects.filter(recipient=head, kind='meeting').exists()
    assert [m.to for m in mailoutbox] == [[member.email]]
    # Une personne hors de l'équipe ne peut pas être invitée
    bad = api(head).post('/api/meetings', {'projectId': str(project.id), 'title': 'X', 'date': iso(when), 'attendees': [str(outsider.id)]}, format='json')
    assert bad.status_code == 400


def test_reminder_three_hours_before_sent_once(api, project, head, member, mailoutbox):
    now = timezone.now()
    r = api(head).post('/api/meetings', {'projectId': str(project.id), 'title': 'Démo', 'date': iso(now + timedelta(hours=5)), 'attendees': [str(member.id), str(head.id)]}, format='json')
    m = Meeting.objects.get(pk=r.json()['id'])
    mailoutbox.clear()
    assert send_due_reminders(now) == 0                         # 5 h avant : trop tôt
    assert send_due_reminders(now + timedelta(hours=2, minutes=5)) == 2  # 2 h 55 avant : rappel à l'auteur et au participant
    assert send_due_reminders(now + timedelta(hours=2, minutes=30)) == 0  # une seule fois
    assert Notification.objects.filter(recipient=member, kind='meeting', title__startswith='Rappel').count() == 1
    assert len(mailoutbox) == 2
    # Déplacée : nouveau rappel possible, et les participants sont prévenus
    api(head).patch(f'/api/meetings/{m.id}', {'date': iso(now + timedelta(days=1))}, format='json')
    m.refresh_from_db()
    assert m.reminder_sent_at is None
    assert Notification.objects.filter(recipient=member, title__startswith='Réunion déplacée').exists()


def test_meeting_soon_has_no_extra_reminder_and_cancel_notifies(api, project, head, member):
    soon = timezone.now() + timedelta(hours=1)
    r = api(head).post('/api/meetings', {'projectId': str(project.id), 'title': 'Urgent', 'date': iso(soon), 'attendees': [str(member.id)]}, format='json')
    assert Meeting.objects.get(pk=r.json()['id']).reminder_sent_at is not None
    assert send_due_reminders() == 0
    assert api(head).delete(f"/api/meetings/{r.json()['id']}").status_code == 200
    assert Notification.objects.filter(recipient=member, title__startswith='Réunion annulée').exists()


def test_meetings_in_calendar(api, project, head, member, admin):
    when = timezone.now() + timedelta(days=1)
    api(head).post('/api/meetings', {'projectId': str(project.id), 'title': 'Sprint review', 'date': iso(when), 'attendees': [str(member.id)]}, format='json')
    day = timezone.localdate(when)
    q = f'/api/me/agenda?from={day}&to={day}'
    for user in (member, admin):
        meeting = next(i for i in api(user).get(q).json() if i['type'] == 'MEETING')
        assert meeting['title'] == 'Sprint review' and meeting['time'] == timezone.localtime(when).strftime('%H:%M')


# ---------- Livrables : fichier ou lien ----------

def test_link_deliverable_and_public_redirect(api, project, head, member):
    folder = project.folders.first()
    r = api(member).post('/api/deliverable-links', {'projectId': str(project.id), 'folderId': str(folder.id), 'name': 'Maquettes', 'url': 'https://www.figma.com/file/abc'}, format='json')
    assert r.status_code == 201
    version = r.json()['versions'][0]
    assert version['kind'] == 'LINK' and version['url'] == 'https://www.figma.com/file/abc'
    assert api(member).post('/api/deliverable-links', {'projectId': str(project.id), 'folderId': str(folder.id), 'name': 'X', 'url': 'javascript:alert(1)'}, format='json').status_code == 400
    link = api(head).post(f"/api/deliverables/{r.json()['id']}/link").json()
    token = link['url'].rsplit('/', 1)[1]
    human = api().get(f'/s/{token}', HTTP_USER_AGENT='Mozilla/5.0')
    assert human.status_code == 302 and human['Location'] == 'https://www.figma.com/file/abc'
    bot = api().get(f'/s/{token}', HTTP_USER_AGENT='WhatsApp/2.0')
    assert bot.status_code == 200 and 'Maquettes' in bot.content.decode()


# ---------- Équipe à la création du projet ----------

def test_create_project_with_team(api, admin, head, member, outsider):
    r = api(admin).post('/api/projects', {
        'name': 'App Sahel', 'clientName': 'Sahel', 'type': 'mobile', 'startDate': iso(timezone.now()), 'dueDate': iso(timezone.now() + timedelta(days=30)),
        'headId': str(head.id), 'memberIds': f'["{member.id}", "{outsider.id}", "{head.id}"]',
    }, format='multipart')
    assert r.status_code == 201, r.json()
    roles = dict(ProjectMembership.objects.filter(project_id=r.json()['id']).values_list('user__email', 'role'))
    assert roles == {head.email: 'HEAD', member.email: 'CONTRIBUTOR', outsider.email: 'CONTRIBUTOR'}
    assert Notification.objects.filter(recipient=member, title='Nouveau projet').exists()


# ---------- Serveurs : fournisseur et type libres ----------

def test_server_free_provider_and_type(api, admin):
    r = api(admin).post('/api/servers', {'label': 'srv-1', 'host': '10.0.0.1', 'provider': 'Hébergeur maison', 'type': 'Kubernetes', 'renewalDate': iso(timezone.now() + timedelta(days=30))}, format='json')
    assert r.status_code == 201, r.json()
    assert api(admin).post('/api/servers', {'label': 'srv-2', 'host': 'x', 'provider': '', 'type': 'VPS'}, format='json').status_code == 400


# ---------- Plus de suivi du temps ----------

def test_time_tracking_removed(api, head, project):
    from apps.tasks.models import Task
    t = Task.objects.create(project=project, title='T', due_date=timezone.now())
    assert api(head).post('/api/timer/start', {'taskId': str(t.id)}, format='json').status_code == 404
    data = api(head).get('/api/bootstrap').json()
    assert 'timeEntries' not in data and 'timer' not in data
    assert all('estimate' not in task for task in data['tasks'])


# ---------- Téléphone du client, dossiers, aperçu ----------

def test_client_phone_optional_and_validated(api, admin):
    base = {'name': 'P', 'clientName': 'C', 'type': 'web', 'startDate': iso(timezone.now()), 'dueDate': iso(timezone.now() + timedelta(days=9))}
    assert api(admin).post('/api/projects', base, format='multipart').json()['clientPhone'] == ''
    ok = api(admin).post('/api/projects', {**base, 'name': 'P2', 'clientPhone': '+213 555 12 34 56'}, format='multipart')
    assert ok.status_code == 201 and ok.json()['clientPhone'] == '+213 555 12 34 56'
    assert api(admin).post('/api/projects', {**base, 'name': 'P3', 'clientPhone': 'appelle-moi'}, format='multipart').status_code == 400


def test_rename_and_delete_folders(api, project, head, member, deliverable):
    full = deliverable.folder
    empty = project.folders.create(name='Vide')
    assert api(member).patch(f'/api/folders/{empty.id}', {'name': 'X'}, format='json').status_code == 403
    assert api(head).patch(f'/api/folders/{empty.id}', {'name': 'Maquettes v2'}, format='json').json()['name'] == 'Maquettes v2'
    assert api(head).delete(f'/api/folders/{full.id}').status_code == 400   # pas vide : refusé
    assert api(head).delete(f'/api/folders/{empty.id}').status_code == 200
    assert not project.folders.filter(pk=empty.pk).exists()


def test_preview_url_inline_for_members_only(api, deliverable, member, outsider):
    r = api(member).get(f'/api/deliverables/{deliverable.id}/versions/1/preview')
    assert r.status_code == 200
    assert 'inline' in r.json()['url'] and 'attachment' in r.json()['downloadUrl']
    assert api(outsider).get(f'/api/deliverables/{deliverable.id}/versions/1/preview').status_code == 404


# ---------- Étapes d'un livrable ----------

def test_deliverable_stages(api, project, head, member, admin, deliverable):
    url = f'/api/deliverables/{deliverable.id}'
    v = deliverable.current_version
    v.uploader = member
    v.save()
    assert api(member).patch(url, {'status': 'SENT'}, format='json').status_code == 403      # un dev ne change pas l'étape
    assert api(head).patch(url, {'status': 'VALIDATED'}, format='json').status_code == 400   # pas avant l'envoi
    r = api(head).patch(url, {'status': 'REJECTED_INTERNAL', 'note': 'Logo flou'}, format='json').json()
    assert r['status'] == 'REJECTED_INTERNAL' and r['statusNote'] == 'Logo flou'
    assert Notification.objects.filter(recipient=member, title='Livrable rejeté avant envoi', body__contains='Logo flou').exists()
    assert api(head).post(f'{url}/link').status_code == 400                                   # pas de partage d'un livrable rejeté
    # Nouvelle version (lien) → « En préparation », puis envoi, puis rejet client, puis correction
    api(member).post('/api/deliverable-links', {'projectId': str(project.id), 'folderId': str(deliverable.folder_id), 'deliverableId': str(deliverable.id), 'url': 'https://example.com/v2'}, format='json')
    deliverable.refresh_from_db()
    assert deliverable.status == 'IN_PROGRESS' and deliverable.status_note == ''
    assert api(head).post(f'{url}/link').status_code == 201
    deliverable.refresh_from_db()
    assert deliverable.status == 'SENT'                                                       # le partage marque « Envoyé »
    assert api(admin).patch(url, {'status': 'REJECTED_CLIENT', 'note': 'Couleurs'}, format='json').json()['status'] == 'REJECTED_CLIENT'
    assert api(admin).patch(url, {'status': 'SENT'}, format='json').status_code == 200        # correction d'une erreur
    assert api(admin).patch(url, {'status': 'VALIDATED'}, format='json').json()['statusNote'] == ''


# ---------- Serveurs choisis par le chef de projet ; retours « de qui / pour qui » ----------

def test_head_picks_project_servers(api, admin, head, member, project):
    from apps.infra.models import Server
    a = Server.objects.create(label='prod', provider='OVH', host='1.1.1.1')
    Server.objects.create(label='old', provider='OVH', host='2.2.2.2', state='DECOMMISSIONED')
    options = api(head).get('/api/bootstrap').json()['serverOptions']
    assert [o['label'] for o in options] == ['prod'] and 'host' not in options[0]   # identité seulement
    assert api(member).get('/api/bootstrap').json()['serverOptions'] == []
    assert api(member).post(f'/api/projects/{project.id}/servers', {'serverIds': [str(a.id)]}, format='json').status_code == 403
    r = api(head).post(f'/api/projects/{project.id}/servers', {'serverIds': [str(a.id)]}, format='json')
    assert r.status_code == 200 and r.json()['serverIds'] == [str(a.id)]
    assert api(head).get('/api/servers').status_code == 403                          # la page Serveurs reste admin


def test_feedback_from_and_for(api, project, head, member, outsider):
    r = api(head).post('/api/feedback', {'projectId': str(project.id), 'type': 'BUG', 'channel': 'Interne', 'content': 'Crash au login',
                                         'fromUserId': str(member.id), 'recipientIds': f'["{member.id}"]'}, format='multipart')
    assert r.status_code == 201, r.json()
    assert r.json()['fromUserId'] == str(member.id) and r.json()['recipientIds'] == [str(member.id)]
    assert Notification.objects.filter(recipient=member, title='Retour à traiter pour vous').exists()
    client = api(head).post('/api/feedback', {'projectId': str(project.id), 'channel': 'WhatsApp', 'contact': 'M. Client', 'content': 'Couleurs'}, format='multipart').json()
    assert client['fromUserId'] is None and client['contact'] == 'M. Client'
    bad = api(head).post('/api/feedback', {'projectId': str(project.id), 'content': 'x', 'recipientIds': f'["{outsider.id}"]'}, format='multipart')
    assert bad.status_code == 400
