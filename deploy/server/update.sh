#!/usr/bin/env bash
# Mise à jour de Zidny Projets sur le serveur, après réception du nouveau code dans /var/www/zidny-projets.
# Ne touche à aucune autre application du serveur.
set -euo pipefail
cd /var/www/zidny-projets
chown -R zidny-projets:zidny-projets /var/www/zidny-projets
sudo -u zidny-projets backend/.venv/bin/pip install -q -r backend/requirements.txt
sudo -u zidny-projets bash -c 'cd backend && .venv/bin/python manage.py migrate --noinput && .venv/bin/python manage.py collectstatic --noinput -v 0'
sudo -u zidny-projets npm ci --no-audit --no-fund --loglevel=error
sudo -u zidny-projets env NODE_OPTIONS=--max-old-space-size=1536 npx next build
systemctl restart zidny-projets-api zidny-projets-worker zidny-projets-beat zidny-projets-web
systemctl --no-pager --lines=0 status zidny-projets-s3 zidny-projets-api zidny-projets-worker zidny-projets-beat zidny-projets-web | grep -E "●|Active"
