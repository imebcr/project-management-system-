from django.contrib import admin

from .models import Deliverable, DeliverableVersion, Folder, ShareLink


class VersionInline(admin.TabularInline):
    model = DeliverableVersion
    extra = 0
    readonly_fields = ('number', 'file_name', 'size', 'mime', 'sha256', 'uploader', 'created_at')


@admin.register(Deliverable)
class DeliverableAdmin(admin.ModelAdmin):
    list_display = ('name', 'project', 'status', 'due_date')
    inlines = [VersionInline]


@admin.register(ShareLink)
class ShareLinkAdmin(admin.ModelAdmin):
    list_display = ('version', 'project', 'expires_at', 'downloads', 'revoked')
    readonly_fields = ('token', 'downloads')


admin.site.register(Folder)
