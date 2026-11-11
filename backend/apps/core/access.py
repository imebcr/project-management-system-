"""
Matrice des droits (CDC v1.1 + v1.2) : Admin · Responsable du projet (HEAD) · Dev membre.
Toutes les vues passent par ces fonctions : c'est ici que la sécurité est appliquée,
le frontend ne fait que masquer ce que l'utilisateur ne peut pas faire.
"""
from django.db.models import Q

from apps.core.errors import ApiError


def is_admin(user) -> bool:
    return bool(user and user.is_authenticated and user.has_role('ADMIN'))


def is_dev(user) -> bool:
    return bool(user and user.is_authenticated and user.has_role('DEV'))


def project_role(project, user):
    m = next((m for m in project.memberships.all() if m.user_id == user.id), None)
    return m.role if m else None


def is_member(project, user) -> bool:
    return project_role(project, user) is not None


def is_head(project, user) -> bool:
    return project_role(project, user) == 'HEAD'


def can_manage(user, project) -> bool:
    """Admin, ou responsable de ce projet : sprints, jalons, équipe, tâches, CDC, livrables, coffre."""
    return is_admin(user) or is_head(project, user)


def can_view(user, project) -> bool:
    if is_admin(user):
        return True
    return project.status != 'ARCHIVED' and is_member(project, user)


def can_upload_deliverables(user, project) -> bool:
    return can_manage(user, project) or is_member(project, user)


def can_share_deliverables(user, project) -> bool:
    return can_manage(user, project)


def can_post_feedback(user, project) -> bool:
    return is_admin(user) or is_member(project, user)


def visible_projects(user):
    from apps.projects.models import Project

    qs = Project.objects.prefetch_related('memberships')
    if is_admin(user):
        return qs
    return qs.filter(memberships__user=user).exclude(status='ARCHIVED').distinct()


def visible_notes_q(user):
    """Une note ciblée n'est visible que par son auteur, ses destinataires et l'admin (COL-01)."""
    if is_admin(user):
        return Q()
    return Q(audience_team=True) | Q(author=user) | Q(recipients=user)


# ---------- Garde-fous à appeler dans les vues ----------

def require_view(user, project):
    if not can_view(user, project):
        raise ApiError("Vous n'êtes pas membre de ce projet.", 403)


def require_manage(user, project):
    if not can_manage(user, project):
        raise ApiError("Réservé à l'admin et au responsable du projet.", 403)


def require_admin(user):
    if not is_admin(user):
        raise ApiError("Réservé à l'admin.", 403)
