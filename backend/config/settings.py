"""
Réglages Django de Zidny Projets. Tout est piloté par les variables d'environnement (.env),
pour passer du poste local (Docker : Postgres, Redis, S3) au VPS sans changer le code.
"""
from datetime import timedelta
from pathlib import Path

import environ
from celery.schedules import crontab

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / '.env')

DEBUG = env.bool('DEBUG', default=False)
SECRET_KEY = env('SECRET_KEY')
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['localhost', '127.0.0.1'])
CSRF_TRUSTED_ORIGINS = env.list('CSRF_TRUSTED_ORIGINS', default=['http://localhost:3000'])
# Adresse publique de l'application (liens d'invitation, liens de livrables).
PUBLIC_URL = env('PUBLIC_URL', default='http://localhost:3000').rstrip('/')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'drf_spectacular',
    'storages',
    'apps.core',
    'apps.accounts',
    'apps.projects',
    'apps.tasks',
    'apps.cdc',
    'apps.feedback',
    'apps.deliverables',
    'apps.infra',
    'apps.vault',
    'apps.notifications',
    'apps.audit',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
APPEND_SLASH = False

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

DATABASES = {'default': env.db('DATABASE_URL')}
DATABASES['default']['CONN_MAX_AGE'] = env.int('DB_CONN_MAX_AGE', default=60)
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REDIS_URL = env('REDIS_URL', default='redis://localhost:6379/0')
CACHES = {'default': {'BACKEND': 'django.core.cache.backends.redis.RedisCache', 'LOCATION': REDIS_URL}}

AUTH_USER_MODEL = 'accounts.User'
# RG / §5.2 : mots de passe hachés en Argon2.
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.Argon2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
]
# Règle simple, à la demande : 6 caractères minimum, sans exigence de complexité.
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 6}},
]

# RG-07 : stockage en UTC, affichage et tâches planifiées à l'heure d'Alger.
LANGUAGE_CODE = 'fr'
TIME_ZONE = 'Africa/Algiers'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# ---------- Stockage des fichiers : S3-compatible (SeaweedFS en local, R2 / Supabase en production) ----------
AWS_ACCESS_KEY_ID = env('S3_ACCESS_KEY')
AWS_SECRET_ACCESS_KEY = env('S3_SECRET_KEY')
AWS_STORAGE_BUCKET_NAME = env('S3_BUCKET', default='zidny')
AWS_S3_ENDPOINT_URL = env('S3_ENDPOINT_URL', default=None)
# Adresse publique des liens signés donnés aux navigateurs, si différente de l'adresse interne.
S3_PUBLIC_ENDPOINT_URL = env('S3_PUBLIC_ENDPOINT_URL', default=None)
AWS_S3_REGION_NAME = env('S3_REGION', default='us-east-1')
AWS_S3_ADDRESSING_STYLE = env('S3_ADDRESSING_STYLE', default='path')
AWS_S3_SIGNATURE_VERSION = 's3v4'
AWS_DEFAULT_ACL = None
AWS_QUERYSTRING_AUTH = True
AWS_QUERYSTRING_EXPIRE = 3600
AWS_S3_FILE_OVERWRITE = False
STORAGES = {
    'default': {'BACKEND': 'storages.backends.s3.S3Storage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}
# Q6 : livrables jusqu'à 2 Go, multipart au-delà de 100 Mo.
MAX_DELIVERABLE_BYTES = env.int('MAX_DELIVERABLE_BYTES', default=2 * 1024**3)
MULTIPART_THRESHOLD = env.int('MULTIPART_THRESHOLD', default=100 * 1024**2)
MULTIPART_PART_SIZE = env.int('MULTIPART_PART_SIZE', default=16 * 1024**2)
DATA_UPLOAD_MAX_MEMORY_SIZE = 30 * 1024**2
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024**2

# ---------- Coffre-fort : clé maître (KEK), jamais en base ni dans le dépôt ----------
VAULT_KEK = env('VAULT_KEK')

# ---------- API ----------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework_simplejwt.authentication.JWTAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_RENDERER_CLASSES': ['djangorestframework_camel_case.render.CamelCaseJSONRenderer'],
    'DEFAULT_PARSER_CLASSES': [
        'djangorestframework_camel_case.parser.CamelCaseJSONParser',
        'djangorestframework_camel_case.parser.CamelCaseMultiPartParser',
        'djangorestframework_camel_case.parser.CamelCaseFormParser',
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_THROTTLE_RATES': {
        'login': '10/min',
        'reauth': '10/min',
        'reveal': '30/min',
        'public_link': '60/min',
        'password_reset': '10/hour',
    },
    'EXCEPTION_HANDLER': 'apps.core.errors.exception_handler',
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'Zidny Projets API',
    'DESCRIPTION': 'Suivi des projets de développement : tâches, sprints, cahiers des charges, livrables, serveurs, coffre-fort.',
    'VERSION': '1.2.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'CAMELIZE_NAMES': True,
    'POSTPROCESSING_HOOKS': ['drf_spectacular.contrib.djangorestframework_camel_case.camelize_serializer_fields'],
}

# §5.2 : access 15 min, refresh 7 jours, rotation + liste noire. Le refresh voyage en cookie httpOnly.
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}
REFRESH_COOKIE_NAME = 'zidny_refresh'
REFRESH_COOKIE_SECURE = env.bool('COOKIE_SECURE', default=not DEBUG)
REFRESH_COOKIE_PATH = '/api/auth'
REAUTH_TTL_SECONDS = 300
VAULT_REVEALS_PER_HOUR = 20
INVITE_TTL_DAYS = 7
PASSWORD_RESET_TIMEOUT = 3600  # lien « Mot de passe oublié » : 1 heure

# ---------- E-mails (invitations) ----------
# Comme le système filmmaking : Gmail (ou tout SMTP) avec un mot de passe d'application.
# Sans SMTP_USER / SMTP_PASSWORD, les e-mails s'affichent dans la console (développement).
SMTP_USER = env('SMTP_USER', default='')
SMTP_PASSWORD = env('SMTP_PASSWORD', default='').replace(' ', '')
EMAIL_FROM_NAME = env('EMAIL_FROM_NAME', default='Zidny Projets')
if SMTP_USER and SMTP_PASSWORD:
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_HOST = env('SMTP_HOST', default='') or 'smtp.gmail.com'
    EMAIL_PORT = int(env('SMTP_PORT', default='') or 465)  # ligne vide = défaut Gmail
    EMAIL_HOST_USER, EMAIL_HOST_PASSWORD = SMTP_USER, SMTP_PASSWORD
    EMAIL_USE_SSL = EMAIL_PORT == 465
    EMAIL_USE_TLS = not EMAIL_USE_SSL
    EMAIL_TIMEOUT = 20
    # Gmail n'envoie qu'au nom du compte lui-même : le nom affiché est gardé, l'adresse est celle du compte.
    DEFAULT_FROM_EMAIL = f'{EMAIL_FROM_NAME} <{SMTP_USER}>'
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
    DEFAULT_FROM_EMAIL = f'{EMAIL_FROM_NAME} <no-reply@localhost>'

# ---------- Celery : rappels, alertes d'expiration, résumé quotidien ----------
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = None
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_ALWAYS_EAGER = env.bool('CELERY_TASK_ALWAYS_EAGER', default=False)
CELERY_BEAT_SCHEDULE = {
    'due-reminders': {'task': 'apps.notifications.tasks.due_reminders', 'schedule': crontab(hour=8, minute=0)},
    'expiry-alerts': {'task': 'apps.notifications.tasks.expiry_alerts', 'schedule': crontab(hour=8, minute=5)},
    'backup-alerts': {'task': 'apps.notifications.tasks.backup_alerts', 'schedule': crontab(hour=8, minute=10)},
    # NTF-04 : 08:30 heure d'Alger, du dimanche au jeudi.
    'daily-summary': {'task': 'apps.notifications.tasks.daily_summary', 'schedule': crontab(hour=8, minute=30, day_of_week='sun,mon,tue,wed,thu')},
    # Rappel de réunion 3 h avant (aussi déclenché par le rafraîchissement de l'application).
    'meeting-reminders': {'task': 'apps.notifications.tasks.meeting_reminders', 'schedule': crontab(minute='*/5')},
}

# ---------- Sécurité HTTP (production derrière Nginx en HTTPS) ----------
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
if not DEBUG:
    SECURE_HSTS_SECONDS = env.int('SECURE_HSTS_SECONDS', default=31536000)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': env('LOG_LEVEL', default='INFO')},
}
