-- ============================================================================
-- MIGRAÇÃO 010 — RECUPERAÇÃO DE SENHA
-- Mesmo padrão de email_verification_tokens (migrations/003_auth.sql):
-- token de uso único, hash no banco, expira, nunca guarda o segredo em claro.
-- ============================================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);
