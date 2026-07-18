#!/usr/bin/env bash
# Teste de restore mensal agendado (plano-construcao.md §2): baixa o backup
# mais recente e restaura num Postgres DESCARTÁVEL (container temporário,
# nunca a produção nem o Postgres nativo da VPS). Se este script falhar, o
# backup não é confiável — trate como incidente.
set -euo pipefail
cd "$(dirname "$0")/../.."

BACKUP_BUCKET="${BACKUP_BUCKET:-$(grep -m1 '^BACKUP_BUCKET=' infra/.env 2>/dev/null | cut -d= -f2-)}"
: "${BACKUP_BUCKET:?defina BACKUP_BUCKET no ambiente ou em infra/.env}"

LATEST=$(rclone lsf "$BACKUP_BUCKET" | sort | tail -n1)
[ -n "$LATEST" ] || { echo "nenhum backup encontrado em $BACKUP_BUCKET"; exit 1; }

TMP="/tmp/${LATEST}"
rclone copy "${BACKUP_BUCKET}/${LATEST}" /tmp/

CONTAINER="ditofeito-restore-test-$$"
cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; rm -f "$TMP"; }
trap cleanup EXIT

# Mesma imagem da produção (docker-compose.yml) -- restore precisa ser
# representativo, não só "algum Postgres qualquer".
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=restoretest -e POSTGRES_DB=ditofeito \
  postgres:16 >/dev/null

echo "aguardando Postgres descartável subir..."
ready=false
for i in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[ "$ready" = true ] || { echo "Postgres descartável não ficou pronto em 60s"; exit 1; }

# Extensões que o schema depende (packages/db/migrations/001_schema.sql,
# 002_tse.sql) -- garantidas aqui como proteção extra, além do que o próprio
# dump já recria via CREATE EXTENSION IF NOT EXISTS.
docker exec -e PGPASSWORD=restoretest "$CONTAINER" \
  psql -h 127.0.0.1 -U postgres -d ditofeito -c \
  "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null

docker cp "$TMP" "$CONTAINER":/tmp/restore.dump
docker exec -e PGPASSWORD=restoretest "$CONTAINER" \
  pg_restore --no-owner -h 127.0.0.1 -U postgres -d ditofeito /tmp/restore.dump

echo "restore de ${LATEST} concluído com sucesso (container descartável removido)"
