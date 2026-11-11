"""
Formes JSON exposées au frontend (mêmes champs que lib/types.ts, en snake_case :
le rendu DRF les convertit en camelCase). Une seule source pour /bootstrap et les réponses d'actions.
"""
from django.utils import timezone

from apps.core import storage


def iso(dt):
    return dt.isoformat().replace('+00:00', 'Z') if dt else None


def user(u):
    return {
        'id': str(u.id), 'name': u.name, 'email': u.email, 'roles': list(u.roles), 'role': u.role, 'department': u.department,
        'active': u.is_active, 'must_change_password': u.must_change_password,
        'created_at': iso(u.date_joined), 'last_login_at': iso(u.last_login),
    }


def invitation(i):
    return {
        'id': str(i.id), 'email': i.email, 'name': i.name, 'roles': list(i.roles), 'role': i.role, 'department': i.department, 'token': i.token,
        'invited_by': str(i.invited_by_id) if i.invited_by_id else None, 'created_at': iso(i.created_at), 'expires_at': iso(i.expires_at),
        'status': i.status, 'accepted_user_id': str(i.accepted_user_id) if i.accepted_user_id else None,
    }


def project(p):
    return {
        'id': str(p.id), 'code': p.code, 'name': p.name, 'client_name': p.client_name, 'client_phone': p.client_phone, 'type': p.type, 'status': p.status,
        'hold_reason': p.hold_reason or None, 'start_date': iso(p.start_date), 'due_date': iso(p.due_date),
        'description': p.description, 'updated_at': iso(p.updated_at),
        'members': [{'user_id': str(m.user_id), 'role': m.role} for m in p.memberships.all()],
        'server_ids': [str(s.id) for s in p.servers.all()],
    }


def task(t):
    return {
        'id': str(t.id), 'project_id': str(t.project_id), 'parent_id': str(t.parent_id) if t.parent_id else None,
        'title': t.title, 'description': t.description, 'assignees': [str(u.id) for u in t.assignees.all()],
        'due_date': iso(t.due_date), 'priority': t.priority, 'status': t.status, 'blocked_reason': t.blocked_reason or None,
        'progress': t.progress, 'last_progress_below100': t.last_progress_below_100,
        'milestone_id': str(t.milestone_id) if t.milestone_id else None, 'sprint_id': str(t.sprint_id) if t.sprint_id else None,
        'labels': t.labels,
    }


def comment(c):
    return {'id': str(c.id), 'task_id': str(c.task_id), 'user_id': str(c.user_id), 'body': c.body, 'date': iso(c.created_at)}


def milestone(m):
    return {
        'id': str(m.id), 'project_id': str(m.project_id), 'name': m.name, 'description': m.description,
        'target_date': iso(m.target_date), 'order': m.order, 'status': m.status,
    }


def sprint(s):
    return {
        'id': str(s.id), 'project_id': str(s.project_id), 'name': s.name, 'goal': s.goal,
        'start_date': iso(s.start_date), 'end_date': iso(s.end_date), 'status': s.status,
    }


def cdc_version(v):
    return {
        'id': str(v.id), 'project_id': str(v.project_id), 'number': v.number, 'date': iso(v.date), 'file_name': v.file_name,
        'file_url': storage.file_url(v.file, v.file_name, inline=False) if v.file else None,
        'delay_days': v.delay_days, 'change_summary': v.change_summary, 'status': v.status, 'author_id': str(v.author_id),
        'sections': v.sections,
    }


def feedback(f):
    target = {'kind': 'APP'} if not f.deliverable_id else {'kind': 'DELIVERABLE', 'deliverable_id': str(f.deliverable_id), 'version_number': f.version_number}
    return {
        'id': str(f.id), 'project_id': str(f.project_id), 'type': f.type, 'target': target, 'channel': f.channel, 'date': iso(f.date),
        'contact': f.contact, 'content': f.content, 'status': f.status, 'author_id': str(f.author_id), 'needs_new_cdc': f.needs_new_cdc,
        'from_user_id': str(f.from_user_id) if f.from_user_id else None, 'recipient_ids': [str(u.id) for u in f.recipients.all()],
        'linked_label': f.linked_label or None,
        'images': [{'id': str(i.id), 'name': i.name, 'url': storage.file_url(i.file, i.name)} for i in f.images.all()],
    }


def folder(f):
    return {'id': str(f.id), 'project_id': str(f.project_id), 'name': f.name, 'parent_id': str(f.parent_id) if f.parent_id else None}


def deliverable(d):
    return {
        'id': str(d.id), 'project_id': str(d.project_id), 'folder_id': str(d.folder_id), 'name': d.name, 'status': d.status,
        'status_note': d.status_note, 'status_changed_at': iso(d.status_changed_at),
        'status_changed_by': str(d.status_changed_by_id) if d.status_changed_by_id else None,
        'due_date': iso(d.due_date),
        'versions': [
            {'id': str(v.id), 'number': v.number, 'kind': 'LINK' if v.url else 'FILE', 'url': v.url or None,
             'file_name': v.file_name, 'size': v.size, 'mime': v.mime, 'sha256': v.sha256,
             'note': v.note, 'uploader_id': str(v.uploader_id), 'date': iso(v.created_at)}
            for v in sorted(d.versions.all(), key=lambda x: x.number)
        ],
    }


def share_link(link):
    return {
        'id': str(link.id), 'project_id': str(link.project_id), 'deliverable_id': str(link.version.deliverable_id),
        'version_number': link.version.number, 'token': link.token, 'created_by': str(link.created_by_id),
        'created_at': iso(link.created_at), 'expires_at': iso(link.expires_at), 'downloads': link.downloads, 'revoked': link.revoked,
    }


def share_access(a):
    return {'id': str(a.id), 'link_id': str(a.link_id), 'date': iso(a.created_at), 'user_agent': a.user_agent}


def server(s):
    return {
        'id': str(s.id), 'label': s.label, 'provider': s.provider, 'type': s.type, 'host': s.host, 'region': s.region, 'os': s.os,
        'project_ids': [str(p.id) for p in s.projects.all()], 'state': s.state, 'last_backup': iso(s.last_backup),
        'last_backup_note': s.last_backup_note, 'backup_frequency_days': s.backup_frequency_days, 'notes': s.notes,
    }


def domain(d):
    return {
        'id': str(d.id), 'name': d.name, 'registrar': d.registrar, 'project_id': str(d.project_id) if d.project_id else '',
        'expires_at': iso(d.expires_at), 'auto_renew': d.auto_renew, 'server_id': str(d.server_id) if d.server_id else None,
    }


def ssl_cert(c):
    return {
        'id': str(c.id), 'domain': c.domain, 'issuer': c.issuer, 'expires_at': iso(c.expires_at), 'auto_renew': c.auto_renew,
        'project_id': str(c.project_id) if c.project_id else '',
    }


def subscription(s):
    return {
        'id': str(s.id), 'provider': s.provider, 'offer': s.offer, 'project_id': str(s.project_id) if s.project_id else '',
        'server_id': str(s.server_id) if s.server_id else None, 'renewal_date': iso(s.renewal_date), 'period': s.period,
    }


def vault_entry(e, show_server: bool):
    """Métadonnées seulement : le secret ne sort que par l'endpoint `reveal` (RG-05)."""
    now = timezone.now()
    return {
        'id': str(e.id), 'category': e.category, 'label': e.label, 'project_id': str(e.project_id) if e.project_id else None,
        'server_id': str(e.server_id) if (show_server and e.server_id) else None, 'url': e.url, 'username': e.username,
        'last_rotation': iso(e.last_rotation),
        'grants': [{'user_id': str(g.user_id), 'expires_at': iso(g.expires_at)} for g in e.grants.all() if not g.expires_at or g.expires_at >= now],
    }


def vault_log(log):
    return {
        'id': str(log.id), 'entry_id': str(log.entry_id), 'user_id': str(log.user_id), 'action': log.action,
        'date': iso(log.created_at), 'ip': log.ip or '', 'device': log.device,
    }


def note(n):
    return {
        'id': str(n.id), 'project_id': str(n.project_id), 'author_id': str(n.author_id), 'content': n.content,
        'audience': 'TEAM' if n.audience_team else [str(u.id) for u in n.recipients.all()], 'pinned': n.pinned, 'date': iso(n.created_at),
    }


def meeting(m):
    return {
        'id': str(m.id), 'project_id': str(m.project_id), 'title': m.title, 'date': iso(m.date), 'kind': m.kind,
        'duration_minutes': m.duration_minutes, 'location': m.location,
        'attendees': [str(u.id) for u in m.attendees.all()], 'client_attendees': m.client_attendees, 'notes': m.notes,
        'decisions': m.decisions, 'author_id': str(m.author_id),
    }


def notification(n):
    return {
        'id': str(n.id), 'audience': [str(n.recipient_id)], 'kind': n.kind, 'title': n.title, 'body': n.body,
        'date': iso(n.created_at), 'read': n.read, 'href': n.href,
    }


def audit_entry(a):
    return {
        'id': str(a.id), 'date': iso(a.created_at), 'user_id': str(a.user_id) if a.user_id else 'system', 'action': a.action,
        'target': a.target, 'project_id': str(a.project_id) if a.project_id else None,
    }
