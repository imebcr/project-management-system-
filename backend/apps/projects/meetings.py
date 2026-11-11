"""
Réunions planifiées : date et heure, participants choisis, notification à la planification
et rappel 3 heures avant (notification dans l'application + e-mail).
"""
import logging
import threading
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.core import shapes
from apps.core.access import is_admin, require_view
from apps.core.errors import ApiError
from apps.notifications.service import notify

from .models import Meeting

log = logging.getLogger(__name__)
User = get_user_model()
REMINDER_BEFORE = timedelta(hours=3)
DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']


def when(dt) -> str:
    """« jeudi 13 novembre à 14:30 » (heure d'Alger)."""
    d = timezone.localtime(dt)
    return f'{DAYS[d.weekday()]} {d.day} {MONTHS[d.month - 1]} à {d:%H:%M}'


def _href(m) -> str:
    return f'/projects/{m.project_id}?tab=meetings'


def _email(users, subject: str, title: str, lines: list[str], m) -> None:
    from apps.accounts.emails import _layout, send
    from html import escape
    url = f'{settings.PUBLIC_URL}{_href(m)}'
    body = ''.join(f'<p style="font-size:14px;line-height:1.6;margin:0 0 8px">{escape(x)}</p>' for x in lines)
    html = _layout(title, body, ('Voir la réunion', url))
    text = '\n'.join([title, '', *lines, '', url])
    to = [u.email for u in users if u.email]

    def run():
        for address in to:
            send(address, subject, text, html)

    if getattr(settings, 'EMAIL_SYNC', False):
        run()  # tests : envoi immédiat
    else:
        # L'envoi SMTP prend 1 à 2 s : jamais dans le temps de réponse de l'application.
        threading.Thread(target=run, daemon=True).start()


def _details(m) -> list[str]:
    lines = [f'Projet : {m.project.name}', f'Quand : {when(m.date)} ({m.duration_minutes} min)']
    if m.location:
        lines.append(f'Lieu : {m.location}')
    names = ', '.join(u.name for u in m.attendees.all())
    if names:
        lines.append(f'Participants : {names}')
    if m.kind == 'Client' and m.client_attendees:
        lines.append(f'Côté client : {m.client_attendees}')
    return lines


def announce(m, author, verb='planifiée', users=None) -> None:
    """Notifie (et prévient par e-mail) les participants d'une réunion planifiée, déplacée ou annulée."""
    targets = [u for u in (users if users is not None else m.attendees.all()) if u.pk != author.pk and u.is_active]
    if not targets or m.date < timezone.now() - timedelta(hours=1) and verb != 'annulée':
        return
    title = f'Réunion {verb} : {m.title}'
    notify(targets, 'meeting', title, f'{when(m.date)} · {m.project.name}', _href(m))
    transaction.on_commit(lambda: _email(targets, f'{title} — {m.project.name}', title, [f'{author.name} a {verb.replace("ée", "é")} cette réunion.' if verb != 'planifiée' else f'{author.name} vous invite à cette réunion.', *_details(m)], m))


def send_due_reminders(now=None) -> int:
    """Rappel unique, 3 heures avant le début, à chaque participant (notification + e-mail)."""
    now = now or timezone.now()
    sent = 0
    due = Meeting.objects.select_related('project').prefetch_related('attendees').filter(
        reminder_sent_at__isnull=True, date__gt=now, date__lte=now + REMINDER_BEFORE,
    )
    for m in due:
        # Verrou ligne par ligne : un seul envoi même si le planificateur et l'application tournent en même temps.
        if not Meeting.objects.filter(pk=m.pk, reminder_sent_at__isnull=True).update(reminder_sent_at=now):
            continue
        users = [u for u in m.attendees.all() if u.is_active]
        minutes = max(1, round((m.date - now).total_seconds() / 60))
        delay = f'dans {minutes // 60} h {minutes % 60:02d}' if minutes >= 60 else f'dans {minutes} min'
        notify(users, 'meeting', f'Rappel : {m.title} {delay}', f'{when(m.date)} · {m.project.name}', _href(m), dedupe_key=f'meeting-reminder-{m.pk}')
        _email(users, f'Rappel : {m.title} {delay}', f'Rappel : réunion {delay}', _details(m), m)
        sent += len(users)
    return sent


def maybe_send_reminders() -> None:
    """
    Appelé par le rafraîchissement de l'application (sans attendre Celery beat) :
    rappels de réunion au plus une fois par minute ; tâches du matin (échéances, renouvellements,
    sauvegardes, résumé) une fois par jour à partir de 8 h. Les notifications sont dédoublonnées par jour.
    """
    if cache.add('meeting-reminders-tick', 1, 60):
        try:
            send_due_reminders()
        except Exception:  # un rappel raté ne doit jamais casser l'application
            log.exception('Rappels de réunion')
    now = timezone.localtime()
    if now.hour >= 8 and cache.add(f'daily-jobs-{now:%Y-%m-%d}', 1, 26 * 3600):
        from apps.notifications import tasks
        jobs = [tasks.due_reminders, tasks.expiry_alerts, tasks.backup_alerts]
        if now.weekday() in (6, 0, 1, 2, 3) and (now.hour, now.minute) >= (8, 30):  # dimanche → jeudi
            jobs.append(tasks.daily_summary)
        for job in jobs:
            try:
                job()
            except Exception:
                log.exception('Tâche quotidienne %s', job.__name__)


def _get(pk) -> Meeting:
    m = Meeting.objects.select_related('project').prefetch_related('attendees', 'project__memberships').filter(pk=pk).first()
    if not m:
        raise ApiError('Réunion introuvable.', 404)
    return m


def _can_write(user, project) -> bool:
    return is_admin(user) or project.memberships.filter(user=user).exists()


def _attendees(project, ids) -> list:
    """Participants : membres de l'équipe du projet, ou admins."""
    ids = {str(x) for x in (ids or [])}
    users = list(User.objects.filter(pk__in=ids, is_active=True))
    allowed = {str(u) for u in project.memberships.values_list('user_id', flat=True)}
    for u in users:
        if str(u.pk) not in allowed and not u.has_role('ADMIN'):
            raise ApiError(f"{u.name} ne fait pas partie de l'équipe du projet.")
    if len(users) != len(ids):
        raise ApiError('Un participant est introuvable ou désactivé.')
    return users


def _fields(m, d, parse_dt) -> None:
    if 'title' in d:
        m.title = (d.get('title') or '').strip()[:200] or 'Réunion'
    if 'date' in d:
        m.date = parse_dt(d.get('date'), 'La date')
    if 'duration_minutes' in d:
        try:
            m.duration_minutes = max(5, min(8 * 60, int(d.get('duration_minutes') or 60)))
        except (TypeError, ValueError):
            raise ApiError('Durée invalide.')
    if 'location' in d:
        m.location = (d.get('location') or '').strip()[:200]
    if 'kind' in d:
        m.kind = d['kind'] if d['kind'] in ('Interne', 'Client') else 'Interne'
    if 'client_attendees' in d:
        m.client_attendees = (d.get('client_attendees') or '')[:300]
    if 'notes' in d:
        m.notes = d.get('notes') or ''
    if 'decisions' in d:
        m.decisions = [str(x).strip() for x in (d.get('decisions') or []) if str(x).strip()]


@api_view(['POST'])
def create_meeting(request):
    from .views import get_project, parse_dt
    d = request.data
    project = get_project(d.get('project_id'))
    require_view(request.user, project)
    if not _can_write(request.user, project):
        raise ApiError("Vous n'êtes pas membre de ce projet.", 403)
    attendees = _attendees(project, d.get('attendees'))
    m = Meeting(project=project, author=request.user, date=parse_dt(d.get('date'), 'La date'))
    _fields(m, d, parse_dt)
    with transaction.atomic():
        # Une réunion créée moins de 3 h avant son début n'a pas besoin d'un rappel en plus de l'invitation.
        if m.date - timezone.now() <= REMINDER_BEFORE:
            m.reminder_sent_at = timezone.now()
        m.save()
        m.attendees.set(attendees)
        announce(m, request.user)
    return Response(shapes.meeting(m), status=201)


@api_view(['PATCH', 'DELETE'])
def meeting_detail(request, pk):
    from .views import parse_dt
    m = _get(pk)
    if not _can_write(request.user, m.project):
        raise ApiError("Vous n'êtes pas membre de ce projet.", 403)
    if request.method == 'DELETE':
        users = list(m.attendees.all())
        with transaction.atomic():
            announce(m, request.user, 'annulée', users)
            m.delete()
        return Response({'ok': True})

    d = request.data
    old_date, old_ids = m.date, {u.pk for u in m.attendees.all()}
    _fields(m, d, parse_dt)
    moved = m.date != old_date
    if moved:
        m.reminder_sent_at = timezone.now() if m.date - timezone.now() <= REMINDER_BEFORE else None
    with transaction.atomic():
        m.save()
        if 'attendees' in d:
            m.attendees.set(_attendees(m.project, d.get('attendees')))
        new_users = [u for u in m.attendees.all() if u.pk not in old_ids]
        if moved:
            announce(m, request.user, 'déplacée')
        elif new_users:
            announce(m, request.user, 'planifiée', new_users)
    return Response(shapes.meeting(_get(pk)))
