import uuid

from django.db import models


class UUIDModel(models.Model):
    """Identifiants UUID : exposés tels quels au frontend (chaînes)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True
