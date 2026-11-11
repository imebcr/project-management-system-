# Déployer Zidny Projets sur un VPS (sans Docker)

Cible : Ubuntu 24.04, un domaine (ex. `projets.example.com`) pointé sur l'IP du serveur, et un bucket Cloudflare R2 ou Supabase Storage.

```
Internet ─▶ Nginx :443 ─┬─ /api, /s, /django-admin, /static ─▶ gunicorn :8000 (Django)
                        └─ tout le reste                     ─▶ next start :3000
Navigateur ─▶ R2/Supabase (dépôt et téléchargement des livrables, URL présignées)
Celery worker + beat ─▶ Redis ; Django ─▶ PostgreSQL
```

## 1. Paquets système

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.12-venv python3-dev build-essential libpq-dev \
                    postgresql redis-server nginx certbot python3-certbot-nginx git
# Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

## 2. Utilisateur et dossiers

```bash
sudo adduser --system --group --home /srv/zidny zidny
sudo mkdir -p /srv/zidny/app /var/lib/zidny
sudo chown -R zidny:zidny /srv/zidny /var/lib/zidny
```

Copiez le code dans `/srv/zidny/app` (avec `git clone`, ou `rsync` depuis votre poste en excluant `node_modules`, `.next`, `backend/.venv` et `backend/.env`).

## 3. PostgreSQL

```bash
sudo -u postgres psql <<'SQL'
CREATE USER zidny WITH PASSWORD 'choisissez-un-mot-de-passe-long';
CREATE DATABASE zidny OWNER zidny;
SQL
```

Redis tourne déjà sur `127.0.0.1:6379` après l'installation.

## 4. Stockage (R2 ou Supabase)

1. Créez un bucket `zidny` (privé).
2. Créez une clé d'API S3 avec lecture et écriture sur ce bucket.
3. Appliquez la règle CORS de [storage-cors.json](storage-cors.json), avec votre domaine dans `AllowedOrigins`. Sans elle, le dépôt de livrables échoue depuis le navigateur. `ExposeHeaders: ETag` est indispensable pour les envois en plusieurs parties.
   - R2 : tableau de bord → bucket → *Settings* → *CORS Policy*.
   - Supabase : les règles CORS du protocole S3 sont gérées par Supabase ; vérifiez qu'un dépôt fonctionne après la mise en ligne.

## 5. Backend

```bash
sudo -iu zidny
cd /srv/zidny/app/backend
python3 -m venv .venv
.venv/bin/pip install -U pip
.venv/bin/pip install -r requirements.txt
cp ../deploy/env.production.example .env
chmod 600 .env
nano .env        # SECRET_KEY, domaine, DATABASE_URL, clés S3, VAULT_KEK, SMTP_USER / SMTP_PASSWORD
```

Générez `VAULT_KEK` une seule fois et gardez-en une copie hors du serveur :

```bash
python3 -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())"
```

Puis :

```bash
.venv/bin/python manage.py check --deploy
.venv/bin/python manage.py migrate
.venv/bin/python manage.py collectstatic --noinput
.venv/bin/python manage.py ensure_bucket      # vérifie l'accès au bucket (le crée s'il manque et si la clé le permet)
.venv/bin/python manage.py invite_admin vous@exemple.com "Votre Nom"   # premier ADMIN : invitation par e-mail
```

Les autres membres s'ajoutent ensuite depuis l'application (Administration → Inviter un membre) : chacun reçoit un e-mail avec un lien valable 7 jours.
Si l'e-mail n'arrive pas, vérifiez `SMTP_USER` / `SMTP_PASSWORD` (mot de passe d'application Gmail) et le dossier spam ; la commande affiche aussi le lien direct.

## 6. Frontend

```bash
cd /srv/zidny/app
npm ci
npm run build
exit             # retour à votre utilisateur sudo
```

## 7. Services systemd

```bash
sudo cp /srv/zidny/app/deploy/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now zidny-api zidny-worker zidny-beat zidny-web
systemctl status zidny-api zidny-worker zidny-beat zidny-web --no-pager
```

Journaux : `journalctl -u zidny-api -f` (de même pour `zidny-worker`, `zidny-beat` et `zidny-web`).

## 8. Nginx et HTTPS

```bash
sudo cp /srv/zidny/app/deploy/nginx/zidny.conf /etc/nginx/sites-available/zidny
sudo sed -i 's/projets.example.com/VOTRE-DOMAINE/g' /etc/nginx/sites-available/zidny
sudo ln -s /etc/nginx/sites-available/zidny /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

Le bloc 443 référence des certificats qui n'existent pas encore. Obtenez-les d'abord :

```bash
sudo systemctl stop nginx
sudo certbot certonly --standalone -d VOTRE-DOMAINE
sudo nginx -t && sudo systemctl start nginx
```

Le renouvellement est automatique (timer `certbot.timer`). Pour qu'il passe par Nginx au lieu du mode autonome : `sudo certbot reconfigure --nginx`.

Pare-feu :

```bash
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

PostgreSQL et Redis n'écoutent que sur `127.0.0.1`. Ne les ouvrez pas.

## 9. Vérifier

- Ouvrez le lien de l'e-mail reçu à l'étape 5, choisissez votre mot de passe, puis invitez un membre depuis Administration et vérifiez qu'il reçoit l'e-mail.
- `https://VOTRE-DOMAINE/api/docs` : documentation OpenAPI.
- Déposez un livrable, cliquez sur **Copier le lien** et ouvrez-le dans une fenêtre privée : le téléchargement doit démarrer.
- Collez le lien dans WhatsApp : l'aperçu affiche le nom du fichier, et le compteur de téléchargements ne bouge pas.

## Mettre à jour

```bash
sudo -iu zidny
cd /srv/zidny/app && git pull            # ou rsync
cd backend && .venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py migrate && .venv/bin/python manage.py collectstatic --noinput
cd .. && npm ci && npm run build
exit
sudo systemctl restart zidny-api zidny-worker zidny-beat zidny-web
```

## Sauvegardes

- **Base de données** : ajoutez une tâche cron quotidienne, par exemple
  `pg_dump -Fc zidny > /var/backups/zidny-$(date +%F).dump`, puis copiez le fichier hors du serveur.
- **Fichiers** : ils sont dans R2 ou Supabase ; activez-y le versioning ou une réplication si besoin.
- **`VAULT_KEK`** : sans cette clé, une sauvegarde de la base ne permet pas de relire le coffre-fort.

Pour changer la clé du coffre :
`manage.py rotate_vault_kek --new-key <nouvelle clé>`, puis remplacez `VAULT_KEK` dans `.env` et redémarrez les services.
