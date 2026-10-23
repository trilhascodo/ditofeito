#!/usr/bin/env bash
# Apaga os mercados eleitorais do 1º turno (ver apps/api/src/jobs/run-apagar-1turno.ts).
# Uso, na VPS, a partir da raiz do repo:
#   infra/scripts/apagar-1turno.sh           # simulação: lista e dá ROLLBACK
#   infra/scripts/apagar-1turno.sh --commit  # pg_dump local + apaga de verdade
set -euo pipefail
cd "$(dirname "$0")/../.."

POSTGRES_PASSWORD="$(grep -m1 '^POSTGRES_PASSWORD=' infra/.env 2>/dev/null | cut -d= -f2-)"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD não encontrada em infra/.env}"
DC="docker compose -f infra/docker-compose.yml"

ARG=""
if [[ "${1:-}" == "--commit" ]]; then
  mkdir -p /root/backups
  OUT="/root/backups/ditofeito_pre-apagar-1turno_$(date -u +%Y%m%dT%H%M%SZ).dump"
  $DC exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
    pg_dump -h localhost -U ditofeito -d ditofeito --format=custom > "$OUT"
  [[ -s "$OUT" ]] || { echo "pg_dump vazio — abortando"; exit 1; }
  echo "backup salvo em $OUT ($(du -h "$OUT" | cut -f1))"
  ARG="--aplicar"
fi

$DC exec -T api node apps/api/dist/jobs/run-apagar-1turno.js $ARG
