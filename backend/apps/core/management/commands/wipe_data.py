"""
Efface TOUTES les données : base PostgreSQL (comptes compris) et fichiers du bucket S3.
Usage : python manage.py wipe_data --yes
Ensuite : python manage.py invite_admin <email> "<Nom>" pour recréer le premier compte.
"""
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from apps.core import storage


class Command(BaseCommand):
    help = 'Efface toutes les données (base + fichiers). Irréversible.'

    def add_arguments(self, parser):
        parser.add_argument('--yes', action='store_true', help='Confirme la suppression définitive.')

    def handle(self, *args, yes=False, **options):
        if not yes:
            raise CommandError('Suppression définitive : relancez avec --yes pour confirmer.')
        call_command('flush', interactive=False, verbosity=0)
        self.stdout.write('Base vidée.')

        client, removed = storage.s3(), 0
        uploads = client.list_multipart_uploads(Bucket=storage.BUCKET).get('Uploads', [])
        for u in uploads:
            client.abort_multipart_upload(Bucket=storage.BUCKET, Key=u['Key'], UploadId=u['UploadId'])
        for page in client.get_paginator('list_objects_v2').paginate(Bucket=storage.BUCKET):
            keys = [{'Key': o['Key']} for o in page.get('Contents', [])]
            for i in range(0, len(keys), 1000):
                client.delete_objects(Bucket=storage.BUCKET, Delete={'Objects': keys[i:i + 1000]})
            removed += len(keys)
        self.stdout.write(f'Stockage vidé : {removed} fichier(s), {len(uploads)} envoi(s) inachevé(s) annulé(s).')
        self.stdout.write(self.style.SUCCESS('Terminé. Créez le premier admin : python manage.py invite_admin <email> "<Nom>"'))
