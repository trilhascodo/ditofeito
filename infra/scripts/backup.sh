#!/usr/bin/env bash
# Backup noturno: pg_dump -> compactado -> upload para object storage (B2/R2).
# "Ledger sem backup testado não é ledger" — plano-construcao.md §2.
set -euo pipefail

: "${DATABASE_URL:?defina DATABASE_URL}"
: "${BACKUP_BUCKET:?defina BACKUP_BUCKET (rclone remote, ex.: r2:ditofeito-backups)}"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="/tmp/ditofeito_${STAMP}.dump"

pg_dump "$DATABASE_URL" --format=custom --file="$OUT"
rclone copy "$OUT" "$BACKUP_BUCKET" --progress
rm -f "$OUT"

echo "backup ${STAMP} enviado para ${BACKUP_BUCKET}"
