from django.contrib import admin

from .models import VaultAccessLog, VaultEntry


@admin.register(VaultEntry)
class VaultEntryAdmin(admin.ModelAdmin):
    """Métadonnées seulement : les secrets restent chiffrés et ne s'affichent jamais ici."""

    list_display = ('label', 'category', 'project', 'last_rotation')
    exclude = ('dek_wrapped', 'secret_ct', 'notes_ct')

    def has_add_permission(self, request):
        return False


@admin.register(VaultAccessLog)
class VaultAccessLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'user', 'entry', 'action', 'ip')
    list_filter = ('action',)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
