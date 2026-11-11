"""
/api/bootstrap : instantané de tout ce que l'utilisateur connecté a le droit de voir.
La portée est appliquée ici : un dev ne reçoit jamais les données d'un autre projet,
ni les serveurs (admin seul), ni aucun secret du coffre (seul `reveal` les renvoie).
"""
from datetime import date, datetime, time

from django.contrib.auth import get_user_model
from django.db.models import Prefetch
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.accounts.models import Invitation, UserPreference
from apps.audit.models import AuditEntry
from apps.cdc.models import CdcVersion
from apps.core import shapes
from apps.projects.meetings import maybe_send_reminders
from apps.core.access import is_admin, visible_notes_q, visible_projects
from apps.core.errors import ApiError
from apps.deliverables.models import Deliverable, DeliverableVersion, Folder, ShareAccess, ShareLink
from apps.feedback.models import Feedback
from apps.infra.models import Domain, Server, SslCert, Subscription
from apps.notifications.models import Notification
from apps.projects.models import Meeting, Milestone, Note, Sprint
from apps.tasks.models import Task, TaskComment
from apps.vault.models import VaultAccessLog
from apps.vault.views import visible_entries

User = get_user_model()


@api_view(['GET'])
def bootstrap(request):
    maybe_send_reminders()  # rappels de réunion, même sans Celery beat
    user = request.user
    admin = is_admin(user)
    projects = list(visible_projects(user))
    ids = [p.id for p in projects]
    headed = [p.id for p in projects if any(m.user_id == user.id and m.role == 'HEAD' for m in p.memberships.all())]
    manageable = ids if admin else headed

    tasks = Task.objects.filter(project_id__in=ids).prefetch_related('assignees')
    deliverables = Deliverable.objects.filter(project_id__in=ids).prefetch_related(Prefetch('versions', queryset=DeliverableVersion.objects.order_by('number')))
    links = ShareLink.objects.filter(project_id__in=manageable).select_related('version')
    entries = list(visible_entries(user))
    pref = UserPreference.objects.filter(user=user).first()

    if admin:
        vault_logs = VaultAccessLog.objects.all()[:300]
    else:
        vault_logs = VaultAccessLog.objects.filter(entry__project_id__in=headed)[:200]

    data = {
        'me': shapes.user(user),
        'users': [shapes.user(u) for u in User.objects.all()],
        'invitations': [shapes.invitation(i) for i in Invitation.objects.all()] if admin else [],
        'projects': [shapes.project(p) for p in projects],
        'tasks': [shapes.task(t) for t in tasks],
        'comments': [shapes.comment(c) for c in TaskComment.objects.filter(task__project_id__in=ids)],
        'milestones': [shapes.milestone(m) for m in Milestone.objects.filter(project_id__in=ids)],
        'sprints': [shapes.sprint(s) for s in Sprint.objects.filter(project_id__in=ids)],
        'cdc_versions': [shapes.cdc_version(v) for v in CdcVersion.objects.filter(project_id__in=ids)],
        'feedbacks': [shapes.feedback(f) for f in Feedback.objects.filter(project_id__in=ids).prefetch_related('images')],
        'folders': [shapes.folder(f) for f in Folder.objects.filter(project_id__in=ids)],
        'deliverables': [shapes.deliverable(d) for d in deliverables],
        'share_links': [shapes.share_link(link) for link in links],
        'share_access': [shapes.share_access(a) for a in ShareAccess.objects.filter(link__project_id__in=manageable)[:500]],
        'servers': [shapes.server(s) for s in Server.objects.prefetch_related('projects')] if admin else [],
        'server_options': [
            {'id': str(s.id), 'label': s.label, 'provider': s.provider, 'type': s.type}
            for s in Server.objects.exclude(state='DECOMMISSIONED')
        ] if admin or headed else [],
        'domains': [shapes.domain(d) for d in Domain.objects.all()] if admin else [],
        'ssl_certs': [shapes.ssl_cert(c) for c in SslCert.objects.all()] if admin else [],
        'subscriptions': [shapes.subscription(s) for s in Subscription.objects.all()] if admin else [],
        'vault_entries': [shapes.vault_entry(e, admin) for e in entries],
        'vault_logs': [shapes.vault_log(log) for log in vault_logs],
        'notes': [shapes.note(n) for n in Note.objects.filter(project_id__in=ids).filter(visible_notes_q(user)).prefetch_related('recipients').distinct()],
        'meetings': [shapes.meeting(m) for m in Meeting.objects.filter(project_id__in=ids).prefetch_related('attendees')],
        'notifications': [shapes.notification(n) for n in Notification.objects.filter(recipient=user)[:100]],
        'audit_log': [shapes.audit_entry(a) for a in AuditEntry.objects.all()[:300]] if admin else [],
        'prefs': {str(user.id): {'projects_view': pref.projects_view if pref else 'list'}},
    }
    response = Response(data)
    response['Cache-Control'] = 'no-store'
    return response


def _day(value: str, field: str) -> date:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ApiError(f'Paramètre {field} : date AAAA-MM-JJ attendue.')


@api_view(['GET'])
def agenda(request):
    """
    GET /api/me/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD : calendrier.
    - Admin : tout, sur tous les projets — tâches, livrables, débuts et fins de sprint, jalons, réunions,
      livraisons des projets et renouvellements (serveurs, domaines, SSL).
    - Dev : ses tâches et les réunions où il est invité ; pour les projets dont il est chef,
      livrables, sprints, jalons et livraison en plus.
    """
    user = request.user
    admin = is_admin(user)
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(_day(request.query_params.get('from'), 'from'), time.min), tz)
    end = timezone.make_aware(datetime.combine(_day(request.query_params.get('to'), 'to'), time.max), tz)
    if (end - start).days > 120:
        raise ApiError('Période trop longue (120 jours maximum).')
    projects = list(visible_projects(user))
    refs = {p.id: {'id': str(p.id), 'code': p.code, 'name': p.name} for p in projects}
    led = list(refs) if admin else [p.id for p in projects if any(m.user_id == user.id and m.role == 'HEAD' for m in p.memberships.all())]
    local = lambda dt: timezone.localtime(dt, tz)  # noqa: E731
    no_project = {'id': None, 'code': '—', 'name': 'Infrastructure'}

    def item(kind, obj_id, title, dt, project_id, status, people=(), timed=False, **extra):
        d = local(dt)
        return {
            'type': kind, 'id': str(obj_id), 'title': title, 'date': d.date().isoformat(),
            'time': d.strftime('%H:%M') if timed else None, 'project': refs.get(project_id, no_project),
            'status': status, 'people': [str(x) for x in people], **extra,
        }

    tasks = Task.objects.filter(project_id__in=refs, due_date__range=(start, end)).exclude(status='CANCELLED').prefetch_related('assignees')
    if not admin:
        tasks = tasks.filter(assignees=user)
    meetings = Meeting.objects.filter(project_id__in=refs, date__range=(start, end)).prefetch_related('attendees')
    if not admin:
        meetings = meetings.filter(attendees=user)

    items = [
        item('TASK', t.id, t.title, t.due_date, t.project_id, t.status, [u.id for u in t.assignees.all()], priority=t.priority)
        for t in tasks.distinct()
    ] + [
        item('MEETING', m.id, m.title, m.date, m.project_id, 'PLANNED' if m.date > timezone.now() else 'DONE', [u.id for u in m.attendees.all()], timed=True,
             duration=m.duration_minutes, location=m.location, meeting_kind=m.kind)
        for m in meetings.distinct()
    ] + [
        item('DELIVERABLE', d.id, d.name, d.due_date, d.project_id, d.status)
        for d in Deliverable.objects.filter(project_id__in=led, due_date__range=(start, end))
    ] + [
        item('SPRINT_START', s.id, f'Début · {s.name}', s.start_date, s.project_id, s.status)
        for s in Sprint.objects.filter(project_id__in=led, start_date__range=(start, end))
    ] + [
        item('SPRINT_END', s.id, f'Fin · {s.name}', s.end_date, s.project_id, s.status)
        for s in Sprint.objects.filter(project_id__in=led, end_date__range=(start, end))
    ] + [
        item('MILESTONE', m.id, m.name, m.target_date, m.project_id, m.status)
        for m in Milestone.objects.filter(project_id__in=led, target_date__range=(start, end))
    ] + [
        item('PROJECT_DUE', p.id, f'Livraison · {p.name}', p.due_date, p.id, p.status)
        for p in projects if p.id in led and start <= p.due_date <= end and p.status not in ('CLOSED', 'ARCHIVED')
    ]
    if admin:
        items += [
            item('RENEWAL', x.id, f'{x.provider} · {x.offer or "abonnement"}', x.renewal_date, x.project_id, x.period)
            for x in Subscription.objects.filter(renewal_date__range=(start, end))
        ] + [
            item('RENEWAL', x.id, f'Domaine · {x.name}', x.expires_at, x.project_id, 'AUTO' if x.auto_renew else 'MANUAL')
            for x in Domain.objects.filter(expires_at__range=(start, end))
        ] + [
            item('RENEWAL', x.id, f'SSL · {x.domain}', x.expires_at, x.project_id, 'AUTO' if x.auto_renew else 'MANUAL')
            for x in SslCert.objects.filter(expires_at__range=(start, end))
        ]
    order = ['MEETING', 'PROJECT_DUE', 'MILESTONE', 'DELIVERABLE', 'SPRINT_START', 'SPRINT_END', 'TASK', 'RENEWAL']
    return Response(sorted(items, key=lambda i: (i['date'], i['time'] or '99:99', order.index(i['type']))))
