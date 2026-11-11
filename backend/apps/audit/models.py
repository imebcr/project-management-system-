from django.conf import settings
from django.db import models

from apps.core.models import UUIDModel


class AuditEntry(UUIDModel):
    """RG-06 : journal des actions sensibles, non modifiable et non supprimable."""

    created_at = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    action = models.CharField(max_length=40)
    target = models.CharField(max_length=300)
    project = models.ForeignKey('projects.Project', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'audit entries'

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise PermissionError("Le journal d'audit est non modifiable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("Le journal d'audit est non supprimable.")


def audit(user, action: str, target: str, project=None):
    AuditEntry.objects.create(user=user if getattr(user, 'is_authenticated', False) else None, action=action, target=target[:300], project=project)
