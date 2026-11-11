#!/usr/bin/env bash
# Depuis le PC (Git Bash), à la racine du projet : envoie la dernière version validée (commit) sur le serveur.
#   bash deploy/server/deploy.sh
# Le frontend est compilé ici, puis copié : le serveur ne fait que l'exécuter.
set -euo pipefail
SERVER=${SERVER:-zidny-server}        # alias SSH (~/.ssh/config) : root@5.135.231.132
APP=/var/www/zidny-projets
cd "$(dirname "$0")/../.."
if [ -n "$(git status --porcelain)" ]; then echo "Des modifications ne sont pas validées (git commit) : abandon."; exit 1; fi

echo "▶ Compilation du frontend…"
rm -rf .next-deploy
NEXT_DIST_DIR=.next-deploy BACKEND_URL=http://127.0.0.1:8100 npx next build >/dev/null

echo "▶ Envoi du code ($(git log -1 --format=%h))…"
git archive --format=tar HEAD | ssh "$SERVER" "tar -x -C $APP"
echo "▶ Envoi du frontend compilé…"
(cd .next-deploy && tar --exclude=./cache -cf - .) | ssh "$SERVER" "rm -rf $APP/.next.new && mkdir $APP/.next.new && tar -x -C $APP/.next.new && rm -rf $APP/.next && mv $APP/.next.new $APP/.next"
rm -rf .next-deploy

echo "▶ Mise à jour sur le serveur…"
ssh "$SERVER" "bash $APP/deploy/server/update.sh"
echo "✓ Déployé."
