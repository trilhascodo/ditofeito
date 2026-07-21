-- ============================================================================
-- MIGRAÇÃO 029 — LOGIN COM GOOGLE (atalho pra e-mail/senha)
-- CPF continua obrigatório pra criar conta — login social não resolve "1
-- conta por pessoa" (não impede várias contas Google), só elimina senha e
-- verificação de e-mail manual (provedor já garante o e-mail é real).
-- password_hash vira opcional: conta só-Google nasce sem senha (pode
-- adicionar depois via "esqueci minha senha", fluxo já existente).
-- oauth_identities separado de users pra permitir múltiplos provedores por
-- conta no futuro (Apple, etc.) sem reabrir esta migração.
-- ============================================================================

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE oauth_identities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         text NOT NULL CHECK (provider IN ('GOOGLE', 'APPLE')),
  provider_user_id text NOT NULL,
  email            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX idx_oauth_identities_user ON oauth_identities(user_id);
