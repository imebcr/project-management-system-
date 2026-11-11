"""Format d'erreur unique de l'API : {"error": "<message lisible en français>", "fields": {...}}."""
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


class ApiError(exceptions.APIException):
    """Erreur métier avec un code HTTP et un message destinés à l'utilisateur."""

    status_code = status.HTTP_400_BAD_REQUEST

    def __init__(self, message: str, code: int = 400):
        super().__init__(message)
        self.status_code = code


FRENCH = {
    'not_authenticated': 'Session expirée. Reconnectez-vous.',
    'authentication_failed': 'Session expirée. Reconnectez-vous.',
    'permission_denied': "Vous n'avez pas les droits pour cette action.",
    'not_found': 'Élément introuvable.',
    'throttled': 'Trop de tentatives. Réessayez dans un instant.',
    'method_not_allowed': 'Action non autorisée.',
}


def _first_message(detail):
    if isinstance(detail, list) and detail:
        return _first_message(detail[0])
    if isinstance(detail, dict) and detail:
        return _first_message(next(iter(detail.values())))
    return str(detail)


def exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(exc.messages)
    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    code = getattr(exc, 'default_code', None)
    if isinstance(exc, ApiError):
        message = str(exc.detail)
    elif isinstance(exc, exceptions.ValidationError):
        message = _first_message(exc.detail)
    else:
        message = FRENCH.get(code, _first_message(response.data))
    body = {'error': message}
    if isinstance(exc, exceptions.ValidationError) and isinstance(exc.detail, dict):
        body['fields'] = exc.detail
    return Response(body, status=response.status_code, headers=getattr(response, 'headers', None))
