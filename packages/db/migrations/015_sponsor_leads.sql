-- ============================================================================
-- MIGRAÇÃO 015 — LEADS DE ANUNCIANTE (página pública /anuncie)
-- Formulário de contato de quem quer contratar um plano de patrocínio, mas
-- ainda não tem conta de anunciante. Vira lead pro admin acompanhar em
-- /admin/leads — nada de e-mail de terceiro/CRM externo.
-- ============================================================================

CREATE TABLE sponsor_leads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  company     text NOT NULL,
  email       text NOT NULL,
  phone       text,
  plan        text CHECK (plan IN ('BASICO', 'PROFISSIONAL', 'PREMIUM')),
  message     text,
  status      text NOT NULL DEFAULT 'NOVO' CHECK (status IN ('NOVO', 'CONTATADO')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sponsor_leads_status ON sponsor_leads(status, created_at DESC);
