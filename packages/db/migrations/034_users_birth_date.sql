-- ============================================================================
-- MIGRAÇÃO 034 — DATA DE NASCIMENTO (idade mínima de uso)
-- Parte da mudança "cadastro em camadas": CPF deixa de ser obrigatório no
-- cadastro (vira column preenchida só no primeiro palpite, ver
-- domain/trade.ts) e data de nascimento assume o papel de barreira de
-- entrada — não é anti-fraude, é idade mínima de uso (mesmo piso do
-- Facebook/Instagram/TikTok, AUTH_CONFIG.minAgeYears).
-- ============================================================================

-- Sem índice/unicidade (ao contrário de cpf em 007_signup_security.sql) —
-- data de nascimento não identifica ninguém sozinha. Nullable: não quebra
-- contas existentes, cadastradas antes desta migração.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS birth_date date;
