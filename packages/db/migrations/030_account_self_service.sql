-- ============================================================================
-- MIGRAÇÃO 030 — AUTOATENDIMENTO DE CONTA
-- Faltava trocar senha (logado), trocar e-mail (com confirmação no e-mail
-- novo — mesmo padrão de segurança do resto: nunca troca sem prova de posse),
-- trocar nome de usuário/exibição, e apagar a própria conta. Vale igual pra
-- conta comum e conta de anunciante (SPONSOR é só um role na mesma tabela).
--
-- "Apagar" é ANONIMIZAÇÃO, não DELETE: comentários, previsões (trades/
-- positions) e cards de vindicação de quem já resolveu ficam públicos por
-- transparência/auditoria (mesma filosofia do ledger hash-encadeado) — só o
-- e-mail/CPF/nome somem. deleted_at marca a conta como removida (distinto de
-- is_banned, que é ação de moderação, não pedido do próprio usuário).
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Mesmo padrão de email_verification_tokens (003_auth.sql), mas guarda o
-- e-mail NOVO pretendido — só aplica na tabela users quando o link é clicado
-- (garante posse da caixa de entrada nova antes de trocar).
CREATE TABLE IF NOT EXISTS email_change_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_email   text NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ect_user ON email_change_tokens(user_id);
