import json

from django.db import transaction
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.core import shapes
from apps.core.access import require_manage
from apps.core.errors import ApiError
from apps.projects.views import get_project

from .models import CdcVersion

ALLOWED = ('.pdf', '.doc', '.docx')


@api_view(['POST'])
def create_version(request):
    """CDC-01 : nouvelle version (fichier PDF/DOCX), résumé des changements obligatoire à partir de la v2."""
    project = get_project(request.data.get('project_id'))
    require_manage(request.user, project)
    upload = request.FILES.get('file')
    if upload and not upload.name.lower().endswith(ALLOWED):
        raise ApiError('Le cahier des charges doit être un PDF ou un document Word.')
    sections = request.data.get('sections') or []
    if isinstance(sections, str):
        sections = json.loads(sections or '[]')
    sections = [{'title': str(s.get('title', '')).strip(), 'body': str(s.get('body', ''))} for s in sections if str(s.get('title', '')).strip()]
    try:
        delay = max(1, int(request.data.get('delay_days') or 30))
    except ValueError:
        raise ApiError('Délai invalide.')
    with transaction.atomic():
        number = (project.cdc_versions.order_by('-number').values_list('number', flat=True).first() or 0) + 1
        summary = (request.data.get('change_summary') or '').strip()
        if number > 1 and not summary:
            raise ApiError('Le résumé des changements est obligatoire à partir de la v2.')
        version = CdcVersion.objects.create(
            project=project, number=number, file=upload, file_name=upload.name if upload else (request.data.get('file_name') or f'CDC_v{number}.pdf'),
            delay_days=delay, change_summary=summary or 'Version initiale.', author=request.user, sections=sections,
        )
    return Response(shapes.cdc_version(version), status=201)


@api_view(['POST'])
def set_status(request, pk):
    """CDC-02 : DRAFT → SENT → ACCEPTED / REJECTED ; accepter remplace la précédente version acceptée."""
    version = CdcVersion.objects.select_related('project').filter(pk=pk).first()
    if not version:
        raise ApiError('Version introuvable.', 404)
    require_manage(request.user, version.project)
    target = request.data.get('status')
    allowed = {'DRAFT': {'SENT'}, 'SENT': {'ACCEPTED', 'REJECTED'}}
    if target not in allowed.get(version.status, set()):
        raise ApiError("Cette version n'est plus modifiable : créez une nouvelle version.")
    with transaction.atomic():
        if target == 'ACCEPTED':
            CdcVersion.objects.filter(project=version.project, status='ACCEPTED').update(status='SUPERSEDED')
        version.status = target
        version.save(update_fields=['status'])
    return Response(shapes.cdc_version(version))
