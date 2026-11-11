"""
Invite un administrateur par e-mail (premier compte après installation ou après wipe_data).
Usage : python manage.py invite_admin prenom.nom@exemple.com "Prénom Nom"
La personne reçoit le même e-mail qu'une invitation faite depuis l'application et choisit son mot de passe.
"""
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.accounts.models import Invitation, User
from apps.accounts.views import _send_invitation, invite_url


class Command(BaseCommand):
    help = 'Envoie une invitation ADMIN par e-mail.'

    def add_arguments(self, parser):
        parser.add_argument('email')
        parser.add_argument('name')
        parser.add_argument('--department', default='Développement')
        parser.add_argument('--also-dev', action='store_true', help='Donne aussi le rôle Dev (tâches, agenda).')

    def handle(self, *args, email, name, department, also_dev=False, **options):
        email = email.strip().lower()
        try:
            validate_email(email)
        except ValidationError:
            raise CommandError(f'Adresse e-mail invalide : {email}')
        if User.objects.filter(email__iexact=email).exists():
            raise CommandError('Un compte existe déjà pour cet e-mail.')
        Invitation.objects.filter(email__iexact=email, status='PENDING').update(status='REVOKED')
        invitation = Invitation.objects.create(email=email, name=name.strip(), roles=['ADMIN', 'DEV'] if also_dev else ['ADMIN'], department=department, invited_by=None)
        sent = _send_invitation(invitation)
        if sent:
            self.stdout.write(self.style.SUCCESS(f'Invitation envoyée à {email} (valable jusqu’au {timezone.localtime(invitation.expires_at):%d/%m/%Y}).'))
        else:
            self.stdout.write(self.style.WARNING("L'e-mail n'a pas pu être envoyé (vérifiez SMTP_USER / SMTP_PASSWORD)."))
        self.stdout.write(f'Lien direct, si besoin : {invite_url(invitation)}')
