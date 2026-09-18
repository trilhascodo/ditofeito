#!/usr/bin/env bash
# Funil de conversão (ver funil.sql) — só leitura. Uso: infra/scripts/funil.sh [dias=60]
set -euo pipefail
cd "$(dirname "$0")/../.."
POSTGRES_PASSWORD="$(grep -m1 '^POSTGRES_PASSWORD=' infra/.env 2>/dev/null | cut -d= -f2-)"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD não encontrada em infra/.env}"
docker compose -f infra/docker-compose.yml exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
  psql -h localhost -U ditofeito -d ditofeito -v ON_ERROR_STOP=1 -v dias="${1:-60}" \
  < infra/scripts/funil.sql
