from django.contrib import admin

from .models import Experiment, Material, Result


class ResultInline(admin.StackedInline):
    model = Result
    extra = 0


@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    list_display = ("name", "description")
    search_fields = ("name",)


@admin.register(Experiment)
class ExperimentAdmin(admin.ModelAdmin):
    list_display = ("code", "material", "source", "duration", "sample_rate", "created_at")
    list_filter = ("material", "source")
    inlines = [ResultInline]
