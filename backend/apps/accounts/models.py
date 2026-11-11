import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.utils import timezone

from apps.core.models import UUIDModel

ROLES = [('ADMIN', 'Admin'), ('DEV', 'Dev')]
ROLE_CODES = [r for r, _ in ROLES]


def default_roles():
    return ['DEV']


def clean_roles(value) -> list[str]:
    """Rôles valides, sans doublon, dans l'ordre de ROLES (ADMIN avant DEV)."""
    wanted = {value} if isinstance(value, str) else set(value or [])
    return [r for r in ROLE_CODES if r in wanted]


def roles_field():
    return ArrayField(models.CharField(max_length=10, choices=ROLES), default=default_roles)


class RolesMixin:
    """Plusieurs rôles globaux par personne (ex. Admin + Dev). `role` = rôle principal (Admin s'il l'a)."""

    @property
    def role(self):
        return 'ADMIN' if 'ADMIN' in (self.roles or []) else 'DEV'

    def has_role(self, code: str) -> bool:
        return code in (self.roles or [])
DEPARTMENTS = [(d, d) for d in ['Développement', 'Design']]


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError("L'e-mail est obligatoire.")
        if 'role' in extra:  # compatibilité : role='ADMIN' → roles=['ADMIN']
            extra['roles'] = clean_roles(extra.pop('role'))
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault('roles', ['ADMIN', 'DEV'])
        extra.setdefault('name', 'Admin')
        extra.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra)


class User(RolesMixin, UUIDModel, AbstractBaseUser, PermissionsMixin):
    """Rôles globaux cumulables : ADMIN et/ou DEV. Le responsable de projet est un rôle dans le projet."""

    email = models.EmailField(unique=True)
    name = models.CharField(max_length=120)
    roles = roles_field()
    department = models.CharField(max_length=30, choices=DEPARTMENTS, default='Développement')
    is_active = models.BooleanField(default=True)
    # Q5 : mot de passe temporaire → changement forcé à la prochaine connexion.
    must_change_password = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name']

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} <{self.email}>'

    @property
    def is_staff(self):
        """Accès à l'admin Django (ADM-02) réservé aux admins."""
        return self.has_role('ADMIN')


def new_token() -> str:
    """Jeton aléatoire de 32 octets, encodé pour une URL (§5.2)."""
    return secrets.token_urlsafe(32)


def invite_expiry():
    return timezone.now() + timedelta(days=settings.INVITE_TTL_DAYS)


class Invitation(RolesMixin, UUIDModel):
    STATUSES = [('PENDING', 'En attente'), ('ACCEPTED', 'Acceptée'), ('REVOKED', 'Annulée')]

    email = models.EmailField()
    name = models.CharField(max_length=120)
    roles = roles_field()
    department = models.CharField(max_length=30, choices=DEPARTMENTS, default='Développement')
    token = models.CharField(max_length=64, unique=True, default=new_token)
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='invitations_sent', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(default=invite_expiry)
    status = models.CharField(max_length=10, choices=STATUSES, default='PENDING')
    accepted_user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-created_at']

    @property
    def is_usable(self):
        return self.status == 'PENDING' and self.expires_at > timezone.now()


class UserPreference(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, primary_key=True, related_name='preference')
    projects_view = models.CharField(max_length=10, choices=[('list', 'Liste'), ('kanban', 'Kanban')], default='list')
