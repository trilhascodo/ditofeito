#!/usr/bin/env bash
# Backup noturno: pg_dump -> compactado -> upload pro object storage (R2/B2).
# "Ledger sem backup testado não é ledger" — plano-construcao.md §2.
#
# Postgres não expõe porta pro host de propósito (infra/nginx/README.md) --
# então pg_dump roda DENTRO do container via `docker compose exec`, não
# direto do host.
set -euo pipefail
cd "$(dirname "$0")/../.."

BACKUP_BUCKET="${BACKUP_BUCKET:-$(grep -m1 '^BACKUP_BUCKET=' infra/.env 2>/dev/null | cut -d= -f2-)}"
: "${BACKUP_BUCKET:?defina BACKUP_BUCKET no ambiente ou em infra/.env (rclone remote, ex.: r2:ditofeito-backups)}"

POSTGRES_PASSWORD="$(grep -m1 '^POSTGRES_PASSWORD=' infra/.env 2>/dev/null | cut -d= -f2-)"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD não encontrada em infra/.env}"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="/tmp/ditofeito_${STAMP}.dump"

docker compose -f infra/docker-compose.yml exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
  pg_dump -h localhost -U ditofeito -d ditofeito --format=custom > "$OUT"

rclone copy "$OUT" "$BACKUP_BUCKET" --progress
rm -f "$OUT"

echo "backup ${STAMP} enviado para ${BACKUP_BUCKET}"
