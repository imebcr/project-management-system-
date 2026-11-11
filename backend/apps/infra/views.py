"""INF-01 → INF-07 : réservé à l'admin (v1.1). Tout autre utilisateur reçoit 403, même par appel direct."""
import calendar
from datetime import timedelta

from django.db import IntegrityError
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.audit.models import audit
from apps.core import shapes
from apps.core.access import require_admin
from apps.core.errors import ApiError
from apps.projects.models import Project
from apps.projects.views import parse_dt

from .models import Domain, Server, SslCert, Subscription


@api_view(['GET', 'POST'])
def servers(request):
    require_admin(request.user)
    if request.method == 'GET':
        return Response([shapes.server(s) for s in Server.objects.prefetch_related('projects')])
    d = request.data
    label, host = (d.get('label') or '').strip(), (d.get('host') or '').strip()
    if not label or not host:
        raise ApiError('Libellé et hôte sont obligatoires.')
    provider, kind = (d.get('provider') or '').strip()[:80], (d.get('type') or '').strip()[:60]
    if not provider or not kind:
        raise ApiError('Fournisseur et type sont obligatoires.')
    try:
        server = Server.objects.create(
            label=label, host=host, provider=provider, type=kind, region=d.get('region', ''), os=d.get('os', ''),
            backup_frequency_days=max(1, int(d.get('backup_frequency_days') or 1)), notes=d.get('notes', ''), last_backup_note='Mise en service',
        )
    except IntegrityError:
        raise ApiError('Un serveur porte déjà ce libellé.')
    server.projects.set(Project.objects.filter(pk__in=d.get('project_ids', [])))
    if d.get('renewal_date'):
        Subscription.objects.create(
            provider=server.provider, offer=d.get('offer', ''), server=server, project=server.projects.first(),
            renewal_date=parse_dt(d['renewal_date'], "L'échéance"), period=d.get('period') if d.get('period') in ('Mensuel', 'Annuel') else 'Mensuel',
        )
    audit(request.user, 'SERVER_CREATE', label, server.projects.first())
    return Response(shapes.server(server), status=201)


def _server(pk) -> Server:
    s = Server.objects.filter(pk=pk).first()
    if not s:
        raise ApiError('Serveur introuvable.', 404)
    return s


@api_view(['POST'])
def server_projects(request, pk):
    """L'admin choisit le ou les serveurs d'un projet (depuis la fiche serveur ou l'aperçu du projet)."""
    require_admin(request.user)
    server = _server(pk)
    project = Project.objects.filter(pk=request.data.get('project_id')).first()
    if not project:
        raise ApiError('Projet introuvable.', 404)
    (server.projects.add if request.data.get('hosted') else server.projects.remove)(project)
    return Response(shapes.server(server))


@api_view(['POST'])
def record_backup(request, pk):
    require_admin(request.user)
    server = _server(pk)
    server.last_backup, server.last_backup_note = timezone.now(), (request.data.get('note') or 'Saisie manuelle')[:200]
    server.save(update_fields=['last_backup', 'last_backup_note'])
    return Response(shapes.server(server))


def add_period(d, period: str):
    """Avance d'un an ou d'un mois en gardant le jour (borné à la fin du mois : 31 janv. → 28/29 févr.)."""
    months = 12 if period == 'Annuel' else 1
    year, month = d.year + (d.month - 1 + months) // 12, (d.month - 1 + months) % 12 + 1
    return d.replace(year=year, month=month, day=min(d.day, calendar.monthrange(year, month)[1]))


@api_view(['POST'])
def renew_subscription(request, pk):
    """Renouvellement effectué : l'échéance avance d'une période (aucun suivi de paiement)."""
    require_admin(request.user)
    sub = Subscription.objects.filter(pk=pk).first()
    if not sub:
        raise ApiError('Abonnement introuvable.', 404)
    sub.renewal_date = add_period(sub.renewal_date, sub.period)
    sub.save(update_fields=['renewal_date'])
    return Response(shapes.subscription(sub))


@api_view(['GET'])
def expiries(request):
    """INF-07 : tout ce qui expire dans les N prochains jours (et ce qui a déjà expiré), trié par date."""
    require_admin(request.user)
    horizon = timezone.now() + timedelta(days=int(request.query_params.get('days', 60)))
    items = (
        [{'kind': 'Domaine', **shapes.domain(d), 'label': d.name, 'date': shapes.iso(d.expires_at)} for d in Domain.objects.filter(expires_at__lte=horizon)]
        + [{'kind': 'SSL', **shapes.ssl_cert(c), 'label': c.domain, 'date': shapes.iso(c.expires_at)} for c in SslCert.objects.filter(expires_at__lte=horizon)]
        + [{'kind': 'Abonnement', **shapes.subscription(s), 'label': f'{s.provider} · {s.offer}', 'date': shapes.iso(s.renewal_date)} for s in Subscription.objects.filter(renewal_date__lte=horizon)]
    )
    return Response(sorted(items, key=lambda i: i['date']))
