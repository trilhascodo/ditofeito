#!/bin/sh
# Aplica migrações + seed a cada boot do container (idempotente — migrate.ts
# só roda o que ainda não está em schema_migrations; seed usa ON CONFLICT).
# Garante que "commit -> VPS" nunca suba código com schema desalinhado.
set -eu

node packages/db/dist/migrate.js
node packages/db/dist/seed.js
exec node apps/api/dist/index.js
