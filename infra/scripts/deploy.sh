#!/usr/bin/env bash
# Roda NA VPS (disparado via SSH pelo .github/workflows/deploy.yml, ou à mão,
# via authorized_keys com command= forçado — ver infra/nginx/README.md e a
# chave dedicada de deploy). "commit -> VPS" = este script.
#
# Bootstrap FINO de propósito: um script bash não pode dar git reset --hard
# em si mesmo com segurança. O processo já tem o arquivo bufferizado quando
# a execução começa; se o reset troca o conteúdo em disco no meio do caminho,
# o que roda depois do reset ainda é o conteúdo ANTIGO que o bash já tinha
# lido (comportamento de buffer, não documentado/garantido) — foi assim que
# a etapa de build do frontend, adicionada num commit, simplesmente não
# rodou no deploy daquele mesmo commit (ficou pra próxima execução, um passo
# atrasada, silenciosamente). Por isso deploy.sh só faz o reset e entrega
# pra um processo NOVO (`exec bash`) rodar deploy-run.sh — que aí sim lê o
# conteúdo atualizado do disco. Mudar a lógica de deploy = editar
# deploy-run.sh, não este arquivo.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "==> git fetch/reset para origin/main"
git fetch origin main
git reset --hard origin/main

exec bash infra/scripts/deploy-run.sh
