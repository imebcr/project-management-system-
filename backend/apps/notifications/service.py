"""Création des notifications (NTF-02). Le contenu sensible n'y figure jamais (§5.2)."""
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction

from .models import Notification


def notify(recipients, kind: str, title: str, body: str = '', href: str = '', dedupe_key: str | None = None, exclude=None):
    """Notifie une liste d'utilisateurs (ou d'identifiants). `dedupe_key` empêche un doublon par destinataire."""
    User = get_user_model()
    ids = {getattr(r, 'pk', r) for r in recipients if r}
    if exclude is not None:
        ids.discard(getattr(exclude, 'pk', exclude))
    created = 0
    for user in User.objects.filter(pk__in=ids, is_active=True):
        try:
            with transaction.atomic():
                Notification.objects.create(recipient=user, kind=kind, title=title[:200], body=body[:500], href=href, dedupe_key=dedupe_key)
                created += 1
        except IntegrityError:
            pass  # déjà notifié pour cette clé
    return created


def admins():
    return get_user_model().objects.filter(roles__contains=['ADMIN'], is_active=True)
