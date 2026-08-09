#!/usr/bin/env bash
# Reinicia la base de DESARROLLO. Destructivo y deliberadamente incómodo.
set -euo pipefail

source .env 2>/dev/null || true
DB_URL="${DATABASE_URL:-}"

if [ -z "$DB_URL" ]; then
  echo "No hay DATABASE_URL. Abortando." >&2; exit 1
fi

case "$DB_URL" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "DATABASE_URL no apunta a localhost. Me niego a resetear una base remota." >&2; exit 1;;
esac

if [ "${NODE_ENV:-development}" = "production" ]; then
  echo "NODE_ENV=production. Me niego." >&2; exit 1
fi

echo "Esto BORRA TODOS LOS DATOS de: $DB_URL"
read -r -p "Escribí 'reset' para confirmar: " answer
[ "$answer" = "reset" ] || { echo "Cancelado."; exit 1; }

pnpm --filter @pulso/db exec prisma migrate reset --force --skip-seed
echo "Listo. Corré 'pnpm db:seed' si querés datos de demo."
