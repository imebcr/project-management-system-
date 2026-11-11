# Zidny Projets

Gestion de projets de développement mobile et web : Next.js (frontend) + Django REST (backend) + PostgreSQL + Redis + stockage S3.

## Lancer en local (Windows)

Prérequis : Docker Desktop, Python 3.12+, Node 22.

```powershell
# 1. Services : PostgreSQL, Redis, stockage S3 local (SeaweedFS)
docker compose up -d

# 2. Backend (premier lancement : créer le venv et le .env)
cd backend
py -3 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env         # puis remplir SECRET_KEY, VAULT_KEK, SMTP_USER et SMTP_PASSWORD
.venv\Scripts\python manage.py migrate
.venv\Scripts\python manage.py ensure_bucket
.venv\Scripts\python manage.py invite_admin vous@exemple.com "Votre Nom"   # premier admin, par e-mail
.venv\Scripts\python manage.py runserver 8000

# 3. Frontend (autre terminal, à la racine)
npm install
npm run dev
```

Ouvrez le lien reçu par e-mail, choisissez votre mot de passe : vous êtes connecté sur http://localhost:3000.
Ensuite, les membres s'ajoutent depuis **Administration → Inviter un membre** : chacun reçoit un e-mail avec son lien personnel (valable 7 jours).

### E-mails (Gmail)

Comme pour le système filmmaking : activez la validation en 2 étapes du compte Gmail, créez un
[mot de passe d'application](https://myaccount.google.com/apppasswords), puis renseignez `SMTP_USER` (l'adresse Gmail)
et `SMTP_PASSWORD` (le mot de passe d'application) dans `backend/.env`. Redémarrez `runserver`.
Si ces deux valeurs sont vides, les e-mails s'affichent dans le terminal de `runserver` (le lien reste utilisable).

### Repartir de zéro

`.venv\Scripts\python manage.py wipe_data --yes` efface toute la base et tous les fichiers, puis relancez `invite_admin`.

| Adresse | Contenu |
|---|---|
| http://localhost:3000 | Application |
| http://localhost:3000/api/docs | Documentation de l'API (OpenAPI) |
| http://localhost:8000/django-admin/ | Admin Django (`createsuperuser` pour y accéder) |

Les tâches de fond (SHA-256, rappels) s'exécutent immédiatement grâce à `CELERY_TASK_ALWAYS_EAGER=True`. Pour tester les rappels planifiés à la main : `manage.py run_reminders`.

## Tests

```powershell
cd backend; .venv\Scripts\python -m pytest     # API, droits, liens, coffre
npm test                                         # règles côté interface
```

## Mise en production

Voir [deploy/DEPLOY.md](deploy/DEPLOY.md) (VPS Ubuntu sans Docker, Nginx, systemd, Cloudflare R2 ou Supabase Storage).
