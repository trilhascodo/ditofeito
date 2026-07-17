-- ============================================================================
-- MIGRAÇÃO 007 — SEGURANÇA DE CADASTRO (unicidade de usuário pré-lançamento)
-- CPF (formato+dígito, sem consulta a bureau) + IP/user-agent do signup pra
-- clustering manual de contas suspeitas (ver routers/moderation.ts).
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS signup_ip text,
  ADD COLUMN IF NOT EXISTS signup_user_agent text;

-- Parcial: não quebra linhas existentes sem CPF (dev/seed), mas toda conta
-- nova (signupSchema exige cpf) fica com número único garantido no banco.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cpf ON users(cpf) WHERE cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_signup_ip ON users(signup_ip) WHERE signup_ip IS NOT NULL;
