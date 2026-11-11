import sys
import threading

from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = 'apps.core'
    label = 'core'

    def ready(self):
        # Le client S3 (boto3) met ~1 s à se créer : on le prépare en arrière-plan au démarrage du serveur
        # pour que la première requête des utilisateurs ne paie pas ce délai.
        argv = ' '.join(sys.argv)
        if 'runserver' in argv or 'gunicorn' in argv:
            from apps.core import storage

            threading.Thread(target=storage.s3, daemon=True).start()
