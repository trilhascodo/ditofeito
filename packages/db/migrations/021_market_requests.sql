-- ============================================================================
-- MIGRAÇÃO 021 — SOLICITAÇÃO DE CRIAÇÃO DE MERCADO
-- Serviço contratado (igual patrocínio, não conteúdo aberto de usuário):
-- veículo/agência propõe um mercado, admin revisa e decide se cria — mesma
-- esteira editorial de sempre (todo mercado nasce DRAFT, resolution_criteria
-- e resolution_source obrigatórios antes de publicar). Isso aqui só abre um
-- canal de ENTRADA pra fora do admin, não pula a revisão.
-- ============================================================================

CREATE TABLE market_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  company           text NOT NULL,
  email             text NOT NULL,
  phone             text,
  proposed_title    text NOT NULL,
  proposed_criteria text NOT NULL,
  proposed_source   text NOT NULL,
  message           text,
  status            text NOT NULL DEFAULT 'NOVO' CHECK (status IN ('NOVO', 'APROVADO', 'REJEITADO')),
  admin_note        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_requests_status ON market_requests(status, created_at DESC);
