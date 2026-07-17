-- ============================================================================
-- MIGRAÇÃO 011 — CONFIGURAÇÃO DE E-MAIL PELO PAINEL ADMIN
-- Tabela singleton (id boolean sempre true — garante 1 linha só). Substitui
-- a leitura direta de RESEND_API_KEY/EMAIL_FROM por uma tela em /admin/email,
-- com fallback pro env var quando api_key_encrypted é NULL (não quebra
-- deploys que nunca tocarem na tela nova).
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_settings (
  id                boolean PRIMARY KEY DEFAULT true,
  from_address      text NOT NULL DEFAULT 'DitoFeito <nao-responda@ditofeito.com>',
  api_key_encrypted text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (id)
);
INSERT INTO email_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
