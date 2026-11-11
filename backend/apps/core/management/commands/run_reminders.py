from django.core.management.base import BaseCommand

from apps.notifications import tasks


class Command(BaseCommand):
    help = 'Exécute une fois les tâches planifiées (utile en local sans Celery beat).'

    def handle(self, *args, **options):
        for name in ('due_reminders', 'expiry_alerts', 'backup_alerts', 'daily_summary'):
            self.stdout.write(f'{name} : {getattr(tasks, name)()} notification(s)')
