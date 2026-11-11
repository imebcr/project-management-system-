from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.accounts import reset
from apps.accounts import views as accounts
from apps.cdc import views as cdc
from apps.core import views as core
from apps.deliverables import views as deliverables
from apps.feedback import views as feedback
from apps.infra import views as infra
from apps.notifications import views as notifications
from apps.projects import views as projects
from apps.projects import meetings
from apps.tasks import views as tasks
from apps.vault import views as vault

api = [
    # Session et compte (§5.2)
    path('auth/login', accounts.login),
    path('auth/refresh', accounts.refresh),
    path('auth/logout', accounts.logout),
    path('auth/password', accounts.change_password),
    path('auth/reauth', accounts.reauth),
    path('auth/forgot', reset.forgot_password),
    path('auth/reset', reset.reset_password_confirm),
    path('auth/reset/<str:uid>/<str:token>', reset.check_reset),
    path('me', accounts.me),
    path('me/preferences', accounts.preferences),
    path('me/agenda', core.agenda),
    path('bootstrap', core.bootstrap),
    # Comptes et invitations (admin)
    path('users/<uuid:pk>', accounts.update_user),
    path('users/<uuid:pk>/reset-password', accounts.reset_password),
    path('invitations', accounts.create_invitation),
    path('invitations/<uuid:pk>', accounts.update_invitation),
    path('invitations/<uuid:pk>/resend', accounts.resend_invitation),
    path('invitations/<uuid:pk>/revoke', accounts.revoke_invitation),
    path('invitations/token/<str:token>', accounts.invitation_info),
    path('invitations/accept', accounts.accept_invitation),
    # Projets
    path('projects', projects.create_project),
    path('projects/<uuid:pk>', projects.update_project),
    path('projects/<uuid:pk>/transition', projects.transition_project),
    path('projects/<uuid:pk>/servers', projects.set_servers),
    path('projects/<uuid:pk>/members', projects.set_member),
    path('projects/<uuid:pk>/members/<uuid:user_id>', projects.set_member),
    path('milestones', projects.create_milestone),
    path('milestones/<uuid:pk>', projects.update_milestone),
    path('sprints', projects.create_sprint),
    path('sprints/<uuid:pk>', projects.update_sprint),
    path('sprints/<uuid:pk>/start', projects.start_sprint),
    path('sprints/<uuid:pk>/close', projects.close_sprint),
    path('meetings', meetings.create_meeting),
    path('meetings/<uuid:pk>', meetings.meeting_detail),
    path('notes', projects.create_note),
    path('notes/<uuid:pk>/pin', projects.toggle_pin),
    # Tâches et temps
    path('tasks', tasks.create_task),
    path('tasks/<uuid:pk>', tasks.update_task),
    path('tasks/<uuid:pk>/status', tasks.set_status),
    path('tasks/<uuid:pk>/progress', tasks.set_progress),
    path('tasks/<uuid:pk>/comments', tasks.add_comment),
    # Cahier des charges et retours
    path('cdc-versions', cdc.create_version),
    path('cdc-versions/<uuid:pk>/status', cdc.set_status),
    path('feedback', feedback.create_feedback),
    path('feedback/<uuid:pk>/status', feedback.set_status),
    path('feedback/<uuid:pk>/toggle-cdc', feedback.toggle_cdc),
    path('feedback/<uuid:pk>/convert', feedback.convert),
    # Livrables
    path('folders', deliverables.create_folder),
    path('folders/<uuid:pk>', deliverables.folder_detail),
    path('deliverables/<uuid:pk>/versions/<int:number>/preview', deliverables.preview_version),
    path('deliverables/<uuid:pk>', deliverables.update_deliverable),
    path('deliverables/<uuid:pk>/link', deliverables.copy_link),
    path('uploads', deliverables.init_upload),
    path('deliverable-links', deliverables.add_link_version),
    path('uploads/<uuid:pk>/parts', deliverables.upload_parts),
    path('uploads/<uuid:pk>/complete', deliverables.complete_upload),
    path('uploads/<uuid:pk>', deliverables.abort_upload),
    path('links/<uuid:pk>', deliverables.update_link),
    path('links/<uuid:pk>/revoke', deliverables.revoke_link),
    # Infra (admin seul)
    path('servers', infra.servers),
    path('servers/<uuid:pk>/projects', infra.server_projects),
    path('servers/<uuid:pk>/backup', infra.record_backup),
    path('subscriptions/<uuid:pk>/renew', infra.renew_subscription),
    path('expiries', infra.expiries),
    # Coffre-fort
    path('vault', vault.create_entry),
    path('vault/<uuid:pk>/reveal', vault.reveal),
    path('vault/<uuid:pk>/log', vault.log_action),
    path('vault/<uuid:pk>/grants', vault.grant),
    # Notifications
    path('notifications/<uuid:pk>/read', notifications.mark_read),
    path('notifications/read-all', notifications.mark_all_read),
    # Documentation OpenAPI
    path('schema', SpectacularAPIView.as_view(), name='schema'),
    path('docs', SpectacularSwaggerView.as_view(url_name='schema')),
]

urlpatterns = [
    path('api/', include(api)),
    path('s/<str:token>', deliverables.public_link),
    path('django-admin/', admin.site.urls),
]
