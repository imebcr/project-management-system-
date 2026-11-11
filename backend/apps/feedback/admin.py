from django.contrib import admin

from .models import Feedback, FeedbackImage


class ImageInline(admin.TabularInline):
    model = FeedbackImage
    extra = 0


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ('project', 'type', 'status', 'author', 'date')
    list_filter = ('type', 'status')
    inlines = [ImageInline]
