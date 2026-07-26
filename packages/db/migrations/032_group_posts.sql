-- ============================================================================
-- MIGRAÇÃO 032 — MURAL DO GRUPO
-- Grupo (031_boloes.sql) não tinha nenhum jeito de conversar dentro da
-- plataforma — só o código de convite, compartilhado por fora. Mural é um
-- mensageiro simples por grupo: sem thread, sem snapshot de posição (isso é
-- característica de comments.ts, ligado a UM mercado — aqui é só recado
-- pro grupo, tipo "bora fechar os palpites do Fla-Vasco").
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id),
  body       text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_group_posts_group ON group_posts(group_id, created_at DESC);
