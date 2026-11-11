"""
Tâches planifiées (Celery beat, heure d'Alger) :
rappels d'échéance, alertes d'expiration et de sauvegarde (admins seulement), résumé quotidien.
Chaque envoi porte une clé de dédoublonnage : relancer une tâche le même jour ne renvoie rien.
"""
from datetime import timedelta

from celery import shared_task
from django.contrib.auth import get_user_model
from django.utils import timezone

from .service import admins, notify

ALERT_DAYS = {7, 3, 1, 0}  # une semaine, 3 jours, la veille, le jour même


def _today():
    return timezone.localdate()


def _days_until(dt) -> int:
    return (timezone.localtime(dt).date() - _today()).days


@shared_task
def due_reminders():
    """« Livrable dû demain » au responsable ; « tâche due demain » aux assignés."""
    from apps.deliverables.models import Deliverable
    from apps.tasks.models import Task

    today, sent = _today(), 0
    for d in Deliverable.objects.select_related('project').exclude(status='VALIDATED').filter(due_date__isnull=False):
        head = d.project.head
        if head and _days_until(d.due_date) == 1:
            sent += notify([head], 'deadline', 'Livrable dû demain', f'{d.name} — {d.project.name}',
                           f'/projects/{d.project_id}?tab=deliverables', dedupe_key=f'dl-due-{d.id}-{today}')
    for t in Task.objects.select_related('project').prefetch_related('assignees').exclude(status__in=['DONE', 'CANCELLED']):
        if _days_until(t.due_date) == 1:
            sent += notify(t.assignees.all(), 'deadline', 'Échéance demain', f'{t.title} — {t.project.name}',
                           f'/projects/{t.project_id}/sprints', dedupe_key=f'task-due-{t.id}-{today}')
    return sent


@shared_task
def expiry_alerts():
    """
    INF-06 : serveurs (abonnements), domaines et SSL à J-7, J-3, J-1, le jour J, puis chaque jour si expiré.
    Destinataires : les admins, et le chef des projets hébergés concernés.
    """
    from apps.infra.models import Domain, SslCert, Subscription

    today, sent = _today(), 0

    def heads(*projects):
        return [p.head for p in projects if p and p.head]

    items = [
        ('Domaine', d.name, d.expires_at, d.id, heads(d.project)) for d in Domain.objects.select_related('project')
    ] + [
        ('Certificat SSL', c.domain, c.expires_at, c.id, heads(c.project)) for c in SslCert.objects.select_related('project')
    ] + [
        ('Serveur', f'{s.server.label if s.server else s.provider} · {s.offer or s.provider}', s.renewal_date, s.id,
         heads(s.project, *(s.server.projects.all() if s.server else [])))
        for s in Subscription.objects.select_related('server', 'project')
    ]
    for kind, label, date, pk, project_heads in items:
        days = _days_until(date)
        if days in ALERT_DAYS or days < 0:
            when = 'aujourd’hui' if days == 0 else 'demain' if days == 1 else f'dans {days} jours'
            body = f'{label} a expiré.' if days < 0 else f'{label} : échéance {when} ({timezone.localtime(date):%d/%m}).'
            title = f'{kind} : renouvellement {"en retard" if days < 0 else when}'
            sent += notify([*admins(), *project_heads], 'expiry', title, body, '/servers', dedupe_key=f'expiry-{pk}-{today}')
    return sent


@shared_task
def backup_alerts():
    """INF-02 : sauvegarde en retard si maintenant − dernière sauvegarde > fréquence attendue."""
    from apps.infra.models import Server

    now, today, sent = timezone.now(), _today(), 0
    for s in Server.objects.exclude(state='DECOMMISSIONED'):
        if now - s.last_backup > timedelta(days=s.backup_frequency_days):
            sent += notify(admins(), 'backup', 'Sauvegarde en retard', f'{s.label} : dernière sauvegarde le {timezone.localtime(s.last_backup):%d/%m}.',
                           '/servers', dedupe_key=f'backup-{s.id}-{today}')
    return sent


@shared_task
def daily_summary():
    """NTF-04 : 08:30 heure d'Alger, du dimanche au jeudi : tâches en retard, du jour et des 3 prochains jours."""
    from apps.tasks.models import Task

    User = get_user_model()
    today, sent = _today(), 0
    for user in User.objects.filter(is_active=True, roles__contains=['DEV']):
        open_tasks = Task.objects.filter(assignees=user).exclude(status__in=['DONE', 'CANCELLED'])
        days = [_days_until(t.due_date) for t in open_tasks]
        late, due_today, soon = sum(d < 0 for d in days), sum(d == 0 for d in days), sum(0 < d <= 3 for d in days)
        body = f'{late} en retard · {due_today} aujourd’hui · {soon} dans les 3 jours'
        sent += notify([user], 'summary', 'Résumé du jour', body, '/tasks', dedupe_key=f'summary-{today}')
    for admin in admins():
        from apps.projects.models import Project
        from apps.infra.models import Domain, SslCert, Subscription

        late = Project.objects.filter(status='ACTIVE', due_date__lt=timezone.now()).count()
        horizon = timezone.now() + timedelta(days=7)
        expiring = Domain.objects.filter(expires_at__lte=horizon).count() + SslCert.objects.filter(expires_at__lte=horizon).count() + Subscription.objects.filter(renewal_date__lte=horizon).count()
        sent += notify([admin], 'summary', 'Résumé du jour', f'{late} projet(s) en retard · {expiring} expiration(s) à 7 jours', '/', dedupe_key=f'summary-{today}')
    return sent


@shared_task
def meeting_reminders():
    """Toutes les 5 minutes : rappel aux participants des réunions qui commencent dans moins de 3 heures."""
    from apps.projects.meetings import send_due_reminders
    return send_due_reminders()
