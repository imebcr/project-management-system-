"""Lien direct (DLV-06), coffre chiffré (VLT), authentification (§5.2) et invitations."""
import base64
import os
from urllib.parse import unquote

import pytest
from django.core.management import call_command

from apps.accounts.models import Invitation
from apps.core import crypto
from apps.deliverables.models import ShareAccess, ShareLink
from apps.notifications.models import Notification
from apps.vault.models import VaultAccessLog, VaultEntry, VaultGrant

pytestmark = pytest.mark.django_db
WHATSAPP = 'WhatsApp/2.23.20.0 A'


@pytest.fixture
def link(deliverable, head):
    return ShareLink.objects.create(project=deliverable.project, version=deliverable.versions.first(), created_by=head)


def test_human_gets_redirect_with_attachment(api, link):
    """Critère 14 : 302 vers une URL présignée avec Content-Disposition: attachment."""
    r = api().get(f'/s/{link.token}', HTTP_USER_AGENT='Mozilla/5.0 Chrome/130')
    assert r.status_code == 302
    location = unquote(r['Location'])
    assert 'response-content-disposition=attachment' in location and 'filename="app.apk"' in location
    link.refresh_from_db()
    assert link.downloads == 1 and ShareAccess.objects.count() == 1
    assert Notification.objects.filter(recipient=link.created_by, kind='deliverable').exists()


def test_whatsapp_preview_not_counted(api, link):
    """Critère 15 : un robot d'aperçu ne compte pas de téléchargement et ne notifie pas."""
    r = api().get(f'/s/{link.token}', HTTP_USER_AGENT=WHATSAPP)
    assert r.status_code == 200 and 'og:title' in r.content.decode() and 'app.apk' in r.content.decode()
    link.refresh_from_db()
    assert link.downloads == 0 and not ShareAccess.objects.exists() and not Notification.objects.exists()


def test_unavailable_links_look_the_same(api, link):
    link.revoked = True
    link.save()
    revoked = api().get(f'/s/{link.token}')
    unknown = api().get('/s/inexistant')
    assert revoked.status_code == unknown.status_code == 404
    assert revoked.content == unknown.content


def test_vault_encryption_roundtrip_and_kek_rotation(settings):
    entry = VaultEntry(category='SERVER', label='SSH')
    entry.set_secret('h7$Kq2!vRz9', 'port 2222')
    entry.save()
    assert b'h7$Kq2' not in bytes(entry.secret_ct)
    new = base64.b64encode(os.urandom(32)).decode()
    call_command('rotate_vault_kek', new_key=new)
    settings.VAULT_KEK = new
    entry.refresh_from_db()
    assert entry.reveal() == ('h7$Kq2!vRz9', 'port 2222')
    with pytest.raises(Exception):
        crypto.unwrap_dek(bytes(entry.dek_wrapped), base64.b64decode(base64.b64encode(os.urandom(32))))


def _reauth(client):
    return client.post('/api/auth/reauth', {'password': 'Zidny2026!'}, format='json').json()['reauthToken']


def test_reveal_requires_reauth_grant_and_is_logged(api, project, member, outsider):
    entry = VaultEntry(category='DATABASE', label='Postgres', project=project)
    entry.set_secret('pg-secret')
    entry.save()
    c = api(member)
    assert c.post(f'/api/vault/{entry.id}/reveal').status_code == 403  # pas d'accès explicite
    VaultGrant.objects.create(entry=entry, user=member)
    assert c.post(f'/api/vault/{entry.id}/reveal').status_code == 403  # pas de ré-authentification
    r = c.post(f'/api/vault/{entry.id}/reveal', HTTP_X_REAUTH_TOKEN=_reauth(c))
    assert r.status_code == 200 and r.json()['secret'] == 'pg-secret'
    assert VaultAccessLog.objects.filter(user=member, action='REVEAL').count() == 1
    o = api(outsider)
    assert o.post(f'/api/vault/{entry.id}/reveal', HTTP_X_REAUTH_TOKEN=_reauth(o)).status_code == 403


def test_reveal_rate_limit_notifies_admin(api, admin, project, head):
    entry = VaultEntry(category='API_KEY', label='Clé', project=project)
    entry.set_secret('k')
    entry.save()
    for _ in range(20):
        VaultAccessLog.objects.create(entry=entry, user=head, action='REVEAL')
    c = api(head)
    r = c.post(f'/api/vault/{entry.id}/reveal', HTTP_X_REAUTH_TOKEN=_reauth(c))
    assert r.status_code == 429
    assert Notification.objects.filter(recipient=admin, kind='vault').exists()


def test_login_refresh_cookie_and_lockout(api, member):
    c = api()
    r = c.post('/api/auth/login', {'email': member.email, 'password': 'Zidny2026!'}, format='json')
    assert r.status_code == 200 and 'access' in r.json()
    cookie = r.cookies['zidny_refresh']
    assert cookie['httponly'] and cookie.value
    refreshed = c.post('/api/auth/refresh')
    assert refreshed.status_code == 200 and refreshed.json()['user']['email'] == member.email
    bad = api()
    for _ in range(5):
        bad.post('/api/auth/login', {'email': member.email, 'password': 'mauvais'}, format='json')
    locked = bad.post('/api/auth/login', {'email': member.email, 'password': 'Zidny2026!'}, format='json')
    assert locked.status_code == 429


def test_reset_password_forces_change(api, admin, member):
    pwd = api(admin).post(f'/api/users/{member.id}/reset-password').json()['password']
    c = api()
    login = c.post('/api/auth/login', {'email': member.email, 'password': pwd}, format='json').json()
    assert login['user']['mustChangePassword'] is True
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access']}")
    assert c.post('/api/auth/password', {'new': 'abc12'}, format='json').status_code == 400
    assert c.post('/api/auth/password', {'new': 'simple'}, format='json').status_code == 200


def test_members_join_only_by_email_invitation(api, admin, member, mailoutbox):
    payload = {'email': 'new@zidny.dz', 'name': 'New', 'role': 'DEV', 'department': 'Développement'}
    assert api(admin).post('/api/users', payload, format='json').status_code in (404, 405)  # plus de création directe
    assert api(member).post('/api/invitations', payload, format='json').status_code == 403
    assert mailoutbox == []


def test_invitation_flow(api, admin, mailoutbox):
    r = api(admin).post('/api/invitations', {'email': 'sara@zidny.dz', 'name': 'Sara', 'role': 'DEV', 'department': 'Développement'}, format='json')
    token = r.json()['invitation']['token']
    # L'invitation part par e-mail (HTML + texte, logo intégré) avec le lien personnel
    assert r.json()['emailSent'] is True and len(mailoutbox) == 1
    mail = mailoutbox[0]
    assert mail.to == ['sara@zidny.dz'] and f'/invite/{token}' in mail.body
    assert f'/invite/{token}' in mail.alternatives[0][0] and 'cid:zidny-logo' in mail.alternatives[0][0]
    assert api(admin).post('/api/invitations', {'email': 'sara@zidny.dz', 'name': 'Sara', 'role': 'DEV', 'department': 'Développement'}, format='json').status_code == 400
    assert api().get(f'/api/invitations/token/{token}').json()['status'] == 'PENDING'
    accepted = api().post('/api/invitations/accept', {'token': token, 'name': 'Sara B', 'password': 'Bienvenue-2026!'}, format='json')
    assert accepted.status_code == 200 and accepted.json()['user']['email'] == 'sara@zidny.dz'
    assert Invitation.objects.get(token=token).status == 'ACCEPTED'
    assert api().post('/api/invitations/accept', {'token': token, 'name': 'X', 'password': 'Bienvenue-2026!'}, format='json').status_code == 400


def test_resend_sends_new_link_and_invite_admin_command(api, admin, mailoutbox):
    from django.core.management import call_command
    r = api(admin).post('/api/invitations', {'email': 'lea@zidny.dz', 'name': 'Léa', 'role': 'DEV', 'department': 'Design'}, format='json').json()
    again = api(admin).post(f"/api/invitations/{r['invitation']['id']}/resend").json()
    assert again['emailSent'] and again['invitation']['token'] != r['invitation']['token']
    assert len(mailoutbox) == 2 and f"/invite/{again['invitation']['token']}" in mailoutbox[1].body

    call_command('invite_admin', 'chef@zidny.dz', 'Chef Admin')
    inv = Invitation.objects.get(email='chef@zidny.dz')
    assert inv.role == 'ADMIN' and inv.invited_by is None and mailoutbox[2].to == ['chef@zidny.dz']
    assert api().get(f'/api/invitations/token/{inv.token}').json()['status'] == 'PENDING'


def test_multiple_roles_admin_and_dev(api, admin, member, mailoutbox):
    from apps.accounts.models import User
    # Invitation avec deux rôles → le compte créé les garde
    r = api(admin).post('/api/invitations', {'email': 'both@zidny.dz', 'name': 'Both', 'roles': ['DEV', 'ADMIN'], 'department': 'Design'}, format='json')
    assert r.status_code == 201 and r.json()['invitation']['roles'] == ['ADMIN', 'DEV']
    assert api(admin).post('/api/invitations', {'email': 'none@zidny.dz', 'name': 'X', 'roles': [], 'department': 'Design'}, format='json').status_code == 400
    token = r.json()['invitation']['token']
    user = api().post('/api/invitations/accept', {'token': token, 'name': 'Both', 'password': 'simple'}, format='json').json()['user']
    assert user['roles'] == ['ADMIN', 'DEV'] and user['role'] == 'ADMIN'
    both = User.objects.get(email='both@zidny.dz')
    # Admin + Dev : accès admin (serveurs) et calendrier ; l'admin seul a aussi le calendrier complet
    assert api(both).get('/api/servers').status_code == 200
    assert api(both).get('/api/me/agenda?from=2026-11-01&to=2026-11-30').status_code == 200
    assert api(admin).get('/api/me/agenda?from=2026-11-01&to=2026-11-30').status_code == 200


def test_admin_edits_member_and_safeguards(api, admin, member):
    r = api(admin).patch(f'/api/users/{member.id}', {'name': 'Nouveau Nom', 'email': 'NEW@zidny.dz', 'department': 'Design', 'roles': ['ADMIN', 'DEV']}, format='json')
    assert r.status_code == 200
    body = r.json()
    assert (body['name'], body['email'], body['department'], body['roles']) == ('Nouveau Nom', 'new@zidny.dz', 'Design', ['ADMIN', 'DEV'])
    member.refresh_from_db()
    assert api(member).patch(f'/api/users/{admin.id}', {'name': 'X'}, format='json').status_code == 200  # devenu admin
    # Garde-fous
    assert api(admin).patch(f'/api/users/{member.id}', {'email': admin.email}, format='json').status_code == 400
    assert api(admin).patch(f'/api/users/{member.id}', {'roles': []}, format='json').status_code == 400
    assert api(admin).patch(f'/api/users/{admin.id}', {'roles': ['DEV']}, format='json').status_code == 400
    assert api(admin).patch(f'/api/users/{admin.id}', {'active': False}, format='json').status_code == 400
    assert api(admin).patch(f'/api/users/{admin.id}', {'roles': ['ADMIN', 'DEV'], 'name': 'Moi'}, format='json').status_code == 200


def test_edit_pending_invitation(api, admin, member, mailoutbox):
    inv = api(admin).post('/api/invitations', {'email': 'p@zidny.dz', 'name': 'P', 'roles': ['DEV'], 'department': 'Design'}, format='json').json()['invitation']
    # Changer nom / rôles : même lien, pas de nouvel e-mail
    r = api(admin).patch(f"/api/invitations/{inv['id']}", {'name': 'Paul', 'roles': ['ADMIN', 'DEV']}, format='json').json()
    assert r['invitation']['name'] == 'Paul' and r['invitation']['roles'] == ['ADMIN', 'DEV']
    assert r['invitation']['token'] == inv['token'] and r['emailSent'] is None and len(mailoutbox) == 1
    # Changer l'e-mail : nouveau lien envoyé à la nouvelle adresse, l'ancien ne marche plus
    r = api(admin).patch(f"/api/invitations/{inv['id']}", {'email': 'paul@zidny.dz'}, format='json').json()
    assert r['emailSent'] is True and mailoutbox[-1].to == ['paul@zidny.dz'] and r['invitation']['token'] != inv['token']
    assert api().get(f"/api/invitations/token/{inv['token']}").json()['status'] == 'UNKNOWN'
    assert api(member).patch(f"/api/invitations/{inv['id']}", {'name': 'X'}, format='json').status_code == 403


def test_forgot_password_flow(api, member, mailoutbox):
    import re
    same = api().post('/api/auth/forgot', {'email': 'personne@nulle.part'}, format='json').json()
    r = api().post('/api/auth/forgot', {'email': member.email.upper()}, format='json').json()
    assert r == same                                        # aucune différence : l'existence du compte n'est pas révélée
    assert len(mailoutbox) == 1 and mailoutbox[0].to == [member.email]
    api().post('/api/auth/forgot', {'email': member.email}, format='json')
    assert len(mailoutbox) == 1                             # pas de 2e e-mail dans les 2 minutes
    uid, token = re.search(r'/reset/([^/\s]+)/([^/\s"]+)', mailoutbox[0].body).groups()
    assert api().get(f'/api/auth/reset/{uid}/{token}').json()['valid'] is True
    assert api().post('/api/auth/reset', {'uid': uid, 'token': token, 'password': '123'}, format='json').status_code == 400
    assert api().post('/api/auth/reset', {'uid': uid, 'token': token, 'password': 'nouveau1'}, format='json').status_code == 200
    assert api().post('/api/auth/login', {'email': member.email, 'password': 'nouveau1'}, format='json').status_code == 200
    # Le lien ne sert qu'une fois
    assert api().get(f'/api/auth/reset/{uid}/{token}').json()['valid'] is False
    assert api().post('/api/auth/reset', {'uid': uid, 'token': token, 'password': 'encore123'}, format='json').status_code == 400
