from django.conf import settings
from django.db import models

from apps.core.models import UUIDModel

KINDS = [(k, k) for k in ['task', 'mention', 'deadline', 'note', 'feedback', 'deliverable', 'expiry', 'backup', 'vault', 'summary', 'meeting']]


class Notification(UUIDModel):
    """NTF-03 : une ligne par destinataire, lecture propre à chacun."""

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    kind = models.CharField(max_length=12, choices=KINDS)
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=500, blank=True, default='')
    href = models.CharField(max_length=300, blank=True, default='')
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    # Évite d'envoyer deux fois le même rappel planifié (ex. « livrable dû demain » du jour J).
    dedupe_key = models.CharField(max_length=200, null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [models.UniqueConstraint(fields=['recipient', 'dedupe_key'], name='unique_notification_dedupe')]
