#!/usr/bin/env bash
# Reset total (ver reset-mercados.sql). Uso, na VPS, a partir da raiz do repo:
#   infra/scripts/reset-mercados.sh           # simulação: roda tudo e dá ROLLBACK
#   infra/scripts/reset-mercados.sh --commit  # pg_dump local + executa de verdade
set -euo pipefail
cd "$(dirname "$0")/../.."

POSTGRES_PASSWORD="$(grep -m1 '^POSTGRES_PASSWORD=' infra/.env 2>/dev/null | cut -d= -f2-)"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD não encontrada em infra/.env}"
DC="docker compose -f infra/docker-compose.yml exec -T -e PGPASSWORD=$POSTGRES_PASSWORD postgres"

END="ROLLBACK;"
if [[ "${1:-}" == "--commit" ]]; then
  mkdir -p /root/backups
  OUT="/root/backups/ditofeito_pre-reset_$(date -u +%Y%m%dT%H%M%SZ).dump"
  $DC pg_dump -h localhost -U ditofeito -d ditofeito --format=custom > "$OUT"
  [[ -s "$OUT" ]] || { echo "pg_dump vazio — abortando"; exit 1; }
  echo "backup salvo em $OUT ($(du -h "$OUT" | cut -f1))"
  END="COMMIT;"
else
  echo "== SIMULAÇÃO (ROLLBACK no fim) =="
fi

{ cat infra/scripts/reset-mercados.sql; echo "$END"; } |
  $DC psql -h localhost -U ditofeito -d ditofeito -v ON_ERROR_STOP=1

echo "fim: $END"
