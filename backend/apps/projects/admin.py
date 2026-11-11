from django.contrib import admin

from .models import Meeting, Milestone, Note, Project, ProjectMembership, Sprint


class MembershipInline(admin.TabularInline):
    model = ProjectMembership
    extra = 0


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'client_name', 'type', 'status', 'due_date')
    list_filter = ('status', 'type')
    search_fields = ('code', 'name', 'client_name')
    inlines = [MembershipInline]


admin.site.register([Milestone, Sprint, Meeting, Note])
