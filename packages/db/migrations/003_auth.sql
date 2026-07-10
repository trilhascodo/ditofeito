-- ============================================================================
-- MIGRAÇÃO 003 — AUTH BÁSICO
-- E-mail+senha (argon2) + verificação de e-mail + sessão em cookie httpOnly.
-- Telefone/SMS adiado (plano-construcao.md §2) para quando houver sinal de
-- manipulação — LIMITE_EXPOSICAO + índice ponderado por reputação já mitigam
-- o risco inicial sem o custo/atrito de SMS no MVP.
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ----------------------------------------------------------------------------
-- Sessões: token bruto vive só no cookie do navegador; o banco guarda o hash
-- (mesmo princípio do ledger — nunca armazenar o segredo em claro).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  user_agent  text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ----------------------------------------------------------------------------
-- Verificação de e-mail: token de uso único, expira, mesmo padrão de hash.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_evt_user ON email_verification_tokens(user_id);
