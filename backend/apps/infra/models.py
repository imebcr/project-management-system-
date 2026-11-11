from django.db import models
from django.utils import timezone

from apps.core.models import UUIDModel


class Server(UUIDModel):
    """INF-01. Réservé à l'admin (v1.1)."""

    # Suggestions affichées à la saisie ; le fournisseur et le type restent libres (on peut en taper d'autres).
    TYPE_SUGGESTIONS = ['VPS', 'Dédié', 'Mutualisé', 'PaaS', 'Base managée', 'Cloud']
    STATES = [('ACTIVE', 'Actif'), ('MAINTENANCE', 'Maintenance'), ('DOWN', 'Hors service'), ('DECOMMISSIONED', 'Décommissionné')]

    label = models.CharField(max_length=120, unique=True)
    provider = models.CharField(max_length=80)
    type = models.CharField(max_length=60, default='VPS')
    host = models.CharField(max_length=255)
    region = models.CharField(max_length=80, blank=True, default='')
    os = models.CharField(max_length=80, blank=True, default='')
    projects = models.ManyToManyField('projects.Project', blank=True, related_name='servers')
    state = models.CharField(max_length=16, choices=STATES, default='ACTIVE')
    last_backup = models.DateTimeField(default=timezone.now)
    last_backup_note = models.CharField(max_length=200, blank=True, default='')
    backup_frequency_days = models.PositiveIntegerField(default=1)
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['label']


class Domain(UUIDModel):
    name = models.CharField(max_length=255, unique=True)
    registrar = models.CharField(max_length=80, blank=True, default='')
    project = models.ForeignKey('projects.Project', null=True, blank=True, on_delete=models.SET_NULL, related_name='domains')
    expires_at = models.DateTimeField()
    auto_renew = models.BooleanField(default=False)
    server = models.ForeignKey(Server, null=True, blank=True, on_delete=models.SET_NULL, related_name='domains')

    class Meta:
        ordering = ['expires_at']


class SslCert(UUIDModel):
    domain = models.CharField(max_length=255)
    issuer = models.CharField(max_length=120, blank=True, default='')
    expires_at = models.DateTimeField()
    auto_renew = models.BooleanField(default=False)
    project = models.ForeignKey('projects.Project', null=True, blank=True, on_delete=models.SET_NULL, related_name='ssl_certs')

    class Meta:
        ordering = ['expires_at']


class Subscription(UUIDModel):
    """INF-05 : abonnement d'hébergement. Aucun montant (v1.2)."""

    provider = models.CharField(max_length=80)
    offer = models.CharField(max_length=120, blank=True, default='')
    project = models.ForeignKey('projects.Project', null=True, blank=True, on_delete=models.SET_NULL, related_name='subscriptions')
    server = models.ForeignKey(Server, null=True, blank=True, on_delete=models.SET_NULL, related_name='subscriptions')
    renewal_date = models.DateTimeField()
    period = models.CharField(max_length=10, choices=[('Mensuel', 'Mensuel'), ('Annuel', 'Annuel')], default='Mensuel')

    class Meta:
        ordering = ['renewal_date']
