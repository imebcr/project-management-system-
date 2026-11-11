from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core import crypto
from apps.core.models import UUIDModel

CATEGORIES = [(c, c) for c in ['SERVER', 'DATABASE', 'STORE', 'CLIENT_ACCOUNT', 'API_KEY', 'OTHER']]


class VaultEntry(UUIDModel):
    """
    VLT-01/02 : métadonnées en clair (recherche), secret et notes secrètes chiffrés en AES-256-GCM
    avec une clé de données propre à l'entrée, enveloppée par la clé maître (VAULT_KEK).
    """

    category = models.CharField(max_length=16, choices=CATEGORIES, default='OTHER')
    label = models.CharField(max_length=160)
    project = models.ForeignKey('projects.Project', null=True, blank=True, on_delete=models.CASCADE, related_name='vault_entries')
    server = models.ForeignKey('infra.Server', null=True, blank=True, on_delete=models.SET_NULL, related_name='vault_entries')
    url = models.CharField(max_length=500, blank=True, default='')
    username = models.CharField(max_length=200, blank=True, default='')
    dek_wrapped = models.BinaryField()
    secret_ct = models.BinaryField()
    notes_ct = models.BinaryField(blank=True, default=b'')
    last_rotation = models.DateTimeField(default=timezone.now)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['label']
        verbose_name_plural = 'vault entries'

    def set_secret(self, secret: str, notes: str = ''):
        dek, self.dek_wrapped = crypto.new_dek()
        self.secret_ct = crypto.encrypt(dek, secret, 'secret')
        self.notes_ct = crypto.encrypt(dek, notes, 'notes') if notes else b''
        self.last_rotation = timezone.now()

    def reveal(self) -> tuple[str, str]:
        dek = crypto.unwrap_dek(bytes(self.dek_wrapped))
        return crypto.decrypt(dek, self.secret_ct, 'secret'), crypto.decrypt(dek, self.notes_ct, 'notes')


class VaultGrant(models.Model):
    """VLT-03 : partage explicite à un dev, avec expiration optionnelle."""

    entry = models.ForeignKey(VaultEntry, on_delete=models.CASCADE, related_name='grants')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='vault_grants')
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['entry', 'user'], name='unique_vault_grant')]


class VaultAccessLog(UUIDModel):
    """VLT-05 : non modifiable, non supprimable."""

    ACTIONS = [(a, a) for a in ['REVEAL', 'COPY', 'CREATE', 'UPDATE', 'SHARE', 'DELETE', 'BLOCKED']]

    entry = models.ForeignKey(VaultEntry, on_delete=models.CASCADE, related_name='logs')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    action = models.CharField(max_length=10, choices=ACTIONS)
    created_at = models.DateTimeField(auto_now_add=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    device = models.CharField(max_length=200, blank=True, default='')

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise PermissionError('Le journal du coffre est non modifiable.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError('Le journal du coffre est non supprimable.')
