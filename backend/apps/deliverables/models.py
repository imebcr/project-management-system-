from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.accounts.models import new_token
from apps.core.models import UUIDModel

LINK_DEFAULT_DAYS = 14
LINK_MAX_DAYS = 90
DEFAULT_FOLDERS = ['Documents', 'Maquettes', 'Builds', 'Vidéos']


class Folder(UUIDModel):
    """DLV-01 : arborescence par projet, profondeur 3 maximum."""

    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='folders')
    name = models.CharField(max_length=120)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.CASCADE, related_name='children')

    class Meta:
        ordering = ['name']

    @property
    def depth(self):
        d, cur = 1, self.parent
        while cur:
            d, cur = d + 1, cur.parent
        return d


class Deliverable(UUIDModel):
    # Étapes, changées par le chef de projet ou l'admin :
    # en préparation → rejeté avant envoi | envoyé au client → validé par le client | rejeté par le client.
    STATUSES = [
        ('IN_PROGRESS', 'En préparation'),
        ('REJECTED_INTERNAL', 'Rejeté avant envoi'),
        ('SENT', 'Envoyé au client'),
        ('VALIDATED', 'Validé par le client'),
        ('REJECTED_CLIENT', 'Rejeté par le client'),
    ]
    # Étapes suivantes possibles (les retours VALIDATED/REJECTED_CLIENT → SENT corrigent une erreur de saisie).
    # Une nouvelle version remet toujours le livrable « En préparation ».
    TRANSITIONS = {
        'IN_PROGRESS': {'REJECTED_INTERNAL', 'SENT'},
        'REJECTED_INTERNAL': {'IN_PROGRESS'},
        'SENT': {'VALIDATED', 'REJECTED_CLIENT'},
        'VALIDATED': {'SENT'},
        'REJECTED_CLIENT': {'SENT'},
    }

    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='deliverables')
    folder = models.ForeignKey(Folder, on_delete=models.PROTECT, related_name='deliverables')
    name = models.CharField(max_length=160)
    status = models.CharField(max_length=20, choices=STATUSES, default='IN_PROGRESS')
    status_note = models.CharField(max_length=500, blank=True, default='')  # motif d'un rejet
    status_changed_at = models.DateTimeField(null=True, blank=True)
    status_changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    # v1.1 : échéance du livrable (agenda du responsable, rappel la veille).
    due_date = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        ordering = ['name']

    @property
    def current_version(self):
        return self.versions.order_by('-number').first()


class DeliverableVersion(UUIDModel):
    deliverable = models.ForeignKey(Deliverable, on_delete=models.CASCADE, related_name='versions')
    number = models.PositiveIntegerField()
    # Une version est soit un fichier déposé (key), soit un lien externe (url : Drive, TestFlight, Figma…).
    key = models.CharField(max_length=500, blank=True, default='')
    url = models.URLField(max_length=1000, blank=True, default='')
    file_name = models.CharField(max_length=255)
    size = models.BigIntegerField(default=0)
    mime = models.CharField(max_length=120, default='application/octet-stream')
    sha256 = models.CharField(max_length=64, blank=True, default='')
    note = models.CharField(max_length=300, blank=True, default='')
    uploader = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    created_at = models.DateTimeField(default=timezone.now)

    @property
    def is_link(self) -> bool:
        return bool(self.url)

    class Meta:
        ordering = ['number']
        constraints = [models.UniqueConstraint(fields=['deliverable', 'number'], name='unique_version_number')]


class UploadSession(UUIDModel):
    """Dépôt direct navigateur → stockage (DLV-03), simple ou multipart avec reprise."""

    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='+')
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE, related_name='+')
    deliverable = models.ForeignKey(Deliverable, null=True, blank=True, on_delete=models.CASCADE, related_name='+')
    name = models.CharField(max_length=160)
    key = models.CharField(max_length=500)
    file_name = models.CharField(max_length=255)
    size = models.BigIntegerField()
    mime = models.CharField(max_length=120)
    upload_id = models.CharField(max_length=300, blank=True, default='')
    part_size = models.PositiveIntegerField(default=0)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def multipart(self):
        return bool(self.upload_id)

    @property
    def part_count(self):
        return max(1, -(-self.size // self.part_size)) if self.part_size else 1


def link_expiry():
    return timezone.now() + timedelta(days=LINK_DEFAULT_DAYS)


class ShareLink(UUIDModel):
    """v1.1 : un lien = une version de livrable ; téléchargement direct, sans mot de passe."""

    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='share_links')
    version = models.ForeignKey(DeliverableVersion, on_delete=models.CASCADE, related_name='links')
    token = models.CharField(max_length=64, unique=True, default=new_token)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(default=link_expiry)
    downloads = models.PositiveIntegerField(default=0)
    revoked = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']

    @property
    def is_active(self):
        return not self.revoked and self.expires_at >= timezone.now()


class ShareAccess(UUIDModel):
    """DLV-06 : chaque téléchargement est journalisé (date, IP, user agent)."""

    link = models.ForeignKey(ShareLink, on_delete=models.CASCADE, related_name='accesses')
    created_at = models.DateTimeField(auto_now_add=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=400, blank=True, default='')

    class Meta:
        ordering = ['-created_at']
