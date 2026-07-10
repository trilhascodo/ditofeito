#!/usr/bin/env bash
# Lógica de deploy de verdade — SEMPRE invocado como processo novo por
# deploy.sh, depois do git reset (nunca roda "em cima de si mesmo", ver o
# comentário em deploy.sh). Seguro editar/estender este arquivo livremente.
set -euo pipefail
cd "$(dirname "$0")/../.."

# NÃO usar `source infra/.env` aqui: valores como
# EMAIL_FROM="DitoFeito <endereco@dominio>" são válidos pro parser do
# docker compose (KEY=VALUE puro) mas quebram o bash (< e > viram
# redirecionamento). Extrai só o que o healthcheck abaixo precisa.
API_HOST_PORT="$(grep -m1 '^API_HOST_PORT=' infra/.env 2>/dev/null | cut -d= -f2- || true)"
API_HOST_PORT="${API_HOST_PORT:-3000}"

echo "==> build do frontend (apps/web/dist — nginx serve estático, ver infra/nginx/)"
pnpm install --frozen-lockfile
pnpm build

echo "==> docker compose up --build"
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build

echo "==> aguardando /health"
for i in $(seq 1 30); do
  if curl -fs "http://127.0.0.1:${API_HOST_PORT}/health" > /dev/null; then
    echo "==> saudável após $((i * 2))s"
    docker image prune -f
    exit 0
  fi
  sleep 2
done

echo "==> API não respondeu saudável a tempo — veja: docker compose -f infra/docker-compose.yml logs api"
exit 1
