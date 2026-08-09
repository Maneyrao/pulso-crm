#!/usr/bin/env bash
# Levanta PostgreSQL y Redis para desarrollo local.
#
# Prefiere Docker si está disponible; si no, usa los servicios nativos de
# Homebrew (ADR-020). Nunca falla en silencio: si algo no está, imprime el
# comando exacto para resolverlo.
set -euo pipefail

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; NC=$'\033[0m'
ok()   { echo "${GREEN}✓${NC} $*"; }
warn() { echo "${YELLOW}!${NC} $*"; }
fail() { echo "${RED}✗${NC} $*" >&2; }

DB_DEV="${PULSO_DB_DEV:-pulso_dev}"
DB_TEST="${PULSO_DB_TEST:-pulso_test}"

use_docker=false
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  use_docker=true
fi

if [ "$use_docker" = true ]; then
  echo "Usando Docker."
  docker compose up -d postgres redis
  echo "Esperando a que respondan..."
  for _ in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -q 2>/dev/null; then break; fi
    sleep 1
  done
  ok "PostgreSQL y Redis levantados con Docker."
  exit 0
fi

echo "Docker no está disponible. Uso los servicios nativos (Homebrew)."
echo

# ── PostgreSQL ──────────────────────────────────────────────────────────────
if ! command -v psql >/dev/null 2>&1; then
  fail "PostgreSQL no está instalado."
  echo "  Instalalo con:"
  echo "    brew install postgresql@16 && brew services start postgresql@16"
  exit 1
fi

if ! pg_isready -q 2>/dev/null; then
  warn "PostgreSQL no está aceptando conexiones. Intento levantarlo..."
  brew services start postgresql@16 >/dev/null 2>&1 || true
  for _ in $(seq 1 15); do pg_isready -q 2>/dev/null && break; sleep 1; done
fi

if ! pg_isready -q 2>/dev/null; then
  fail "PostgreSQL no responde."
  echo "  Probá:"
  echo "    brew services restart postgresql@16"
  echo "    tail -50 \$(brew --prefix)/var/log/postgresql@16.log"
  exit 1
fi
ok "PostgreSQL responde ($(psql --version | awk '{print $3}'))."

for db in "$DB_DEV" "$DB_TEST"; do
  if psql -lqt 2>/dev/null | cut -d\| -f1 | grep -qw "$db"; then
    ok "Base '$db' ya existe."
  else
    createdb "$db" && ok "Base '$db' creada."
  fi
done

# ── Redis ───────────────────────────────────────────────────────────────────
if ! command -v redis-cli >/dev/null 2>&1; then
  fail "Redis no está instalado."
  echo "  Instalalo con:"
  echo "    brew install redis && brew services start redis"
  exit 1
fi

if ! redis-cli ping >/dev/null 2>&1; then
  warn "Redis no responde. Intento levantarlo..."
  brew services start redis >/dev/null 2>&1 || true
  for _ in $(seq 1 15); do redis-cli ping >/dev/null 2>&1 && break; sleep 1; done
fi

if ! redis-cli ping >/dev/null 2>&1; then
  fail "Redis no responde."
  echo "  Causa frecuente en Redis 8.x de Homebrew: redis.conf trae directivas"
  echo "  'loadmodule ./modules/...' con rutas relativas a módulos que no están"
  echo "  instalados, y el servidor aborta al arrancar. Verificá el log y, si es"
  echo "  eso, comentá esas líneas:"
  echo "    tail -20 \$(brew --prefix)/var/log/redis.log"
  echo "    sed -i '' 's|^loadmodule \\./modules/|# loadmodule ./modules/|' \$(brew --prefix)/etc/redis.conf"
  echo "    brew services restart redis"
  exit 1
fi
ok "Redis responde."

echo
ok "Servicios locales listos."
