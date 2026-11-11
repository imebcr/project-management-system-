from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.core.models import UUIDModel

PROJECT_STATUSES = [
    ('DRAFT', 'Brouillon'), ('ACTIVE', 'Actif'), ('ON_HOLD', 'En pause'),
    ('DELIVERED', 'Livré'), ('CLOSED', 'Clôturé'), ('ARCHIVED', 'Archivé'),
]

# PRJ-02 : transitions autorisées (ARCHIVED depuis tout statut, admin uniquement).
TRANSITIONS = {
    'DRAFT': {'ACTIVE'},
    'ACTIVE': {'ON_HOLD', 'DELIVERED'},
    'ON_HOLD': {'ACTIVE'},
    'DELIVERED': {'CLOSED'},
}


def can_transition(current: str, target: str) -> bool:
    if current == target:
        return False
    return target == 'ARCHIVED' or target in TRANSITIONS.get(current, set())


class Project(UUIDModel):
    """v1.2 : projets de développement uniquement (mobile ou web), client saisi librement."""

    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=160)
    client_name = models.CharField(max_length=160)
    client_phone = models.CharField(max_length=40, blank=True, default='')
    type = models.CharField(max_length=10, choices=[('mobile', 'Mobile'), ('web', 'Web')], default='mobile')
    status = models.CharField(max_length=12, choices=PROJECT_STATUSES, default='DRAFT')
    hold_reason = models.CharField(max_length=300, blank=True, default='')
    start_date = models.DateTimeField()
    due_date = models.DateTimeField()
    description = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['due_date']

    def __str__(self):
        return f'{self.code} · {self.name}'

    @property
    def head(self):
        m = next((m for m in self.memberships.all() if m.role == 'HEAD'), None)
        return m.user if m else None

    @staticmethod
    def next_code() -> str:
        year = timezone.now().year
        prefix = f'ZD-{year}-'
        last = Project.objects.filter(code__startswith=prefix).order_by('-code').values_list('code', flat=True).first()
        n = int(last.rsplit('-', 1)[1]) + 1 if last else 1
        return f'{prefix}{n:03d}'


class ProjectMembership(models.Model):
    ROLES = [('HEAD', 'Responsable'), ('CONTRIBUTOR', 'Contributeur')]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='memberships')
    role = models.CharField(max_length=12, choices=ROLES, default='CONTRIBUTOR')

    class Meta:
        ordering = ['-role', 'id']
        constraints = [
            models.UniqueConstraint(fields=['project', 'user'], name='unique_member'),
            # v1.1 : un seul responsable (HEAD) par projet.
            models.UniqueConstraint(fields=['project'], condition=Q(role='HEAD'), name='one_head_per_project'),
        ]


class Milestone(UUIDModel):
    STATUSES = [('PLANNED', 'Planifié'), ('IN_PROGRESS', 'En cours'), ('DONE', 'Atteint')]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='milestones')
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True, default='')
    target_date = models.DateTimeField()
    order = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=12, choices=STATUSES, default='PLANNED')

    class Meta:
        ordering = ['order', 'target_date']


class Sprint(UUIDModel):
    STATUSES = [('PLANNED', 'Planifié'), ('ACTIVE', 'Actif'), ('CLOSED', 'Clôturé')]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='sprints')
    name = models.CharField(max_length=120)
    goal = models.CharField(max_length=300, blank=True, default='')
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    status = models.CharField(max_length=10, choices=STATUSES, default='PLANNED')

    class Meta:
        ordering = ['start_date']
        constraints = [
            # MIL-02 : un seul sprint actif par projet.
            models.UniqueConstraint(fields=['project'], condition=Q(status='ACTIVE'), name='one_active_sprint_per_project'),
        ]


class Meeting(UUIDModel):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='meetings')
    title = models.CharField(max_length=200)
    date = models.DateTimeField(db_index=True)
    duration_minutes = models.PositiveIntegerField(default=60)
    location = models.CharField(max_length=200, blank=True, default='')
    kind = models.CharField(max_length=10, choices=[('Interne', 'Interne'), ('Client', 'Client')], default='Interne')
    attendees = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='+')
    client_attendees = models.CharField(max_length=300, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    decisions = models.JSONField(default=list, blank=True)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    # Rappel 3 h avant : envoyé une seule fois (remis à zéro si la réunion est déplacée).
    reminder_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-date']


class Note(UUIDModel):
    """COL-01 : note à toute l'équipe ou à des membres précis (filtrage serveur)."""

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='notes')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    content = models.TextField()
    audience_team = models.BooleanField(default=True)
    recipients = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='+')
    pinned = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-pinned', '-created_at']
