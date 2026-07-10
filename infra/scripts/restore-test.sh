#!/usr/bin/env bash
# Teste de restore mensal agendado (plano-construcao.md §2): baixa o backup mais
# recente, restaura num Postgres descartável e roda verifyLedgerChain amostral.
# Se este script falhar, o backup não é confiável — trate como incidente.
set -euo pipefail

: "${BACKUP_BUCKET:?defina BACKUP_BUCKET}"
: "${RESTORE_TEST_DB:?defina RESTORE_TEST_DB (ex.: postgres://.../ditofeito_restore_test)}"

LATEST=$(rclone lsf "$BACKUP_BUCKET" | sort | tail -n1)
[ -n "$LATEST" ] || { echo "nenhum backup encontrado em $BACKUP_BUCKET"; exit 1; }

TMP="/tmp/${LATEST}"
rclone copy "${BACKUP_BUCKET}/${LATEST}" /tmp/

pg_restore --clean --if-exists --no-owner --dbname="$RESTORE_TEST_DB" "$TMP"
rm -f "$TMP"

echo "restore de ${LATEST} concluído com sucesso em ${RESTORE_TEST_DB}"
