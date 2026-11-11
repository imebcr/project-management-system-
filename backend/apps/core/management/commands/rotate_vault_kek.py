from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core import crypto
from apps.vault.models import VaultEntry


class Command(BaseCommand):
    help = (
        "VLT-02 : rotation de la clé maître du coffre. Re-chiffre l'enveloppe de chaque entrée avec la nouvelle clé "
        "(les secrets eux-mêmes ne sont pas déchiffrés). Remplacez ensuite VAULT_KEK par la nouvelle valeur."
    )

    def add_arguments(self, parser):
        parser.add_argument('--new-key', required=True, help='Nouvelle KEK : 32 octets en base64.')

    def handle(self, *args, new_key, **options):
        try:
            new = crypto.parse_key(new_key)
        except Exception as e:
            raise CommandError(str(e))
        old = crypto.kek()
        if new == old:
            raise CommandError('La nouvelle clé est identique à la clé actuelle.')
        with transaction.atomic():
            entries = list(VaultEntry.objects.select_for_update())
            for e in entries:
                e.dek_wrapped = crypto.rewrap(bytes(e.dek_wrapped), old, new)
                e.save(update_fields=['dek_wrapped'])
        self.stdout.write(self.style.SUCCESS(f'{len(entries)} entrée(s) re-chiffrée(s). Mettez maintenant VAULT_KEK={new_key} dans .env et redémarrez.'))
