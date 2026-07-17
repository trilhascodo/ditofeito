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
for i in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

docker cp "$TMP" "$CONTAINER":/tmp/restore.dump
docker exec -e PGPASSWORD=restoretest "$CONTAINER" \
  pg_restore --clean --if-exists --no-owner -U postgres -d ditofeito /tmp/restore.dump

echo "restore de ${LATEST} concluído com sucesso (container descartável removido)"
