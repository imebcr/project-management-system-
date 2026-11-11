"""§5.2 : limitation de débit sur la connexion, la ré-authentification, la révélation et les liens publics."""
from rest_framework.throttling import SimpleRateThrottle


class _IPThrottle(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


class _UserThrottle(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        ident = request.user.pk if request.user and request.user.is_authenticated else self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class LoginThrottle(_IPThrottle):
    scope = 'login'


class ReauthThrottle(_UserThrottle):
    scope = 'reauth'


class RevealThrottle(_UserThrottle):
    scope = 'reveal'


class PasswordResetThrottle(_IPThrottle):
    scope = 'password_reset'


class PublicLinkThrottle(_IPThrottle):
    scope = 'public_link'
