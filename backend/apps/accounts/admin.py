from django.contrib import admin

from .models import Invitation, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('name', 'email', 'roles', 'department', 'is_active', 'last_login')
    list_filter = ('department', 'is_active')
    search_fields = ('name', 'email')
    exclude = ('password', 'groups', 'user_permissions', 'is_superuser')
    readonly_fields = ('last_login', 'date_joined')


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ('email', 'roles', 'status', 'expires_at', 'invited_by')
    list_filter = ('status',)
    readonly_fields = ('token',)
