#!/usr/bin/env bash
# Roda NA VPS (disparado via SSH pelo .github/workflows/deploy.yml, ou à mão).
# Pressupõe: repo clonado, infra/.env já configurado (nunca commitado),
# usuário com acesso ao Docker. "commit -> VPS" = este script.
set -euo pipefail
cd "$(dirname "$0")/../.."

# Carrega infra/.env no shell do script também (não só no docker compose) —
# assim API_HOST_PORT etc. ficam disponíveis pro healthcheck abaixo.
set -a
# shellcheck disable=SC1091
[ -f infra/.env ] && source infra/.env
set +a

echo "==> git fetch/reset para origin/main"
git fetch origin main
git reset --hard origin/main

echo "==> docker compose up --build"
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build

echo "==> aguardando /health"
API_HOST_PORT="${API_HOST_PORT:-3000}"
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
