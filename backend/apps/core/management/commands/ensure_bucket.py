from django.core.management.base import BaseCommand

from apps.core import storage


class Command(BaseCommand):
    help = "Crée le bucket S3 s'il n'existe pas (stockage local ou nouveau fournisseur)."

    def handle(self, *args, **options):
        storage.ensure_bucket()
        self.stdout.write(self.style.SUCCESS(f'Bucket « {storage.BUCKET} » prêt.'))
