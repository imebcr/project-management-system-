from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import UUIDModel

TYPES = [('CHANGE_REQUEST', 'Demande de modification'), ('FEEDBACK', 'Remarque'), ('VALIDATION', 'Validation'), ('BUG', 'Bug')]
CHANNELS = [(c, c) for c in ['Interne', 'Appel', 'WhatsApp', 'E-mail', 'Réunion', 'Autre']]
STATUSES = [('OPEN', 'Ouvert'), ('ACCEPTED', 'Accepté'), ('REJECTED', 'Refusé'), ('DONE', 'Traité')]


class Feedback(UUIDModel):
    """v1.2 : retour texte + photos sur l'application ou une version de livrable."""

    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='feedbacks')
    type = models.CharField(max_length=16, choices=TYPES, default='FEEDBACK')
    deliverable = models.ForeignKey('deliverables.Deliverable', null=True, blank=True, on_delete=models.SET_NULL, related_name='feedbacks')
    version_number = models.PositiveIntegerField(null=True, blank=True)
    channel = models.CharField(max_length=10, choices=CHANNELS, default='Interne')
    contact = models.CharField(max_length=160, blank=True, default='')
    content = models.TextField(blank=True, default='')
    status = models.CharField(max_length=10, choices=STATUSES, default='OPEN')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    # De qui vient le retour (membre de l'équipe) ; côté client, c'est `contact`.
    from_user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    # Pour qui : les membres chargés de le traiter (notifiés).
    recipients = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='feedbacks_to_handle')
    needs_new_cdc = models.BooleanField(default=False)
    linked_label = models.CharField(max_length=120, blank=True, default='')
    date = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-date']


def image_path(instance, filename):
    return f'feedback/{instance.feedback.project_id}/{instance.feedback_id}/{filename}'


class FeedbackImage(UUIDModel):
    feedback = models.ForeignKey(Feedback, on_delete=models.CASCADE, related_name='images')
    file = models.FileField(upload_to=image_path)
    name = models.CharField(max_length=200)

    class Meta:
        ordering = ['id']
