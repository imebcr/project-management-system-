from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import UUIDModel

PRIORITIES = [('LOW', 'Basse'), ('MEDIUM', 'Moyenne'), ('HIGH', 'Haute'), ('URGENT', 'Urgente')]
STATUSES = [
    ('TODO', 'À faire'), ('IN_PROGRESS', 'En cours'), ('IN_REVIEW', 'En revue'),
    ('DONE', 'Terminé'), ('BLOCKED', 'Bloqué'), ('CANCELLED', 'Annulé'),
]


class Task(UUIDModel):
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='tasks')
    # TSK-03 : un seul niveau de sous-tâches.
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.CASCADE, related_name='subtasks')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    assignees = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='assigned_tasks')
    due_date = models.DateTimeField()
    priority = models.CharField(max_length=8, choices=PRIORITIES, default='MEDIUM')
    status = models.CharField(max_length=12, choices=STATUSES, default='TODO')
    blocked_reason = models.CharField(max_length=300, blank=True, default='')
    progress = models.PositiveSmallIntegerField(default=0)
    last_progress_below_100 = models.PositiveSmallIntegerField(default=0)
    milestone = models.ForeignKey('projects.Milestone', null=True, blank=True, on_delete=models.SET_NULL, related_name='tasks')
    sprint = models.ForeignKey('projects.Sprint', null=True, blank=True, on_delete=models.SET_NULL, related_name='tasks')
    labels = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['due_date', 'created_at']


class TaskComment(UUIDModel):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='comments')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
