#!/usr/bin/env bash
# Côté serveur : appliquer une mise à jour déjà copiée dans /var/www/zidny-projets (code + .next construit sur le PC).
# Pas de compilation ici (protège la mémoire des autres applications). Ne touche à aucune autre application.
set -euo pipefail
cd /var/www/zidny-projets
chown -R zidny-projets:zidny-projets /var/www/zidny-projets
sudo -u zidny-projets backend/.venv/bin/pip install -q -r backend/requirements.txt
sudo -u zidny-projets bash -c 'cd backend && .venv/bin/python manage.py migrate --noinput && .venv/bin/python manage.py collectstatic --noinput -v 0'
sudo -u zidny-projets HOME=/var/lib/zidny-projets npm ci --omit=dev --no-audit --no-fund --loglevel=error
systemctl restart zidny-projets-api zidny-projets-worker zidny-projets-beat zidny-projets-web
sleep 5
for s in s3 api worker beat web; do echo "zidny-projets-$s : $(systemctl is-active zidny-projets-$s)"; done
