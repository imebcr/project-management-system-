from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import UUIDModel


def cdc_path(instance, filename):
    return f'cdc/{instance.project_id}/v{instance.number}/{filename}'


class CdcVersion(UUIDModel):
    """Version du cahier des charges (CDC-01). Aucune notion de prix (v1.2)."""

    STATUSES = [('DRAFT', 'Brouillon'), ('SENT', 'Envoyé'), ('ACCEPTED', 'Accepté'), ('REJECTED', 'Refusé'), ('SUPERSEDED', 'Remplacé')]

    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='cdc_versions')
    number = models.PositiveIntegerField()
    date = models.DateTimeField(default=timezone.now)
    file = models.FileField(upload_to=cdc_path, blank=True)
    file_name = models.CharField(max_length=200, blank=True, default='')
    delay_days = models.PositiveIntegerField(default=30)
    change_summary = models.TextField(blank=True, default='')
    status = models.CharField(max_length=12, choices=STATUSES, default='DRAFT')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    sections = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ['-number']
        constraints = [models.UniqueConstraint(fields=['project', 'number'], name='unique_cdc_number')]
