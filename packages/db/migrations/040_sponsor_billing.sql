-- ============================================================================
-- MIGRAÇÃO 040 — COBRANÇA REAL DE PATROCÍNIO (SALDO PRÉ-PAGO / MERCADO PAGO)
-- Até aqui virar patrocinador e pedir campanha era 100% gratuito no banco —
-- nenhuma tabela de preço, fatura ou pagamento. Modelo escolhido (inspirado
-- em Meta Ads/Google Ads, só a parte de pagamento, sem leilão — volume de
-- patrocinador não justifica motor de lance em tempo real): preço fixo por
-- plano/mês (o que já está em Anuncie.tsx/mídia kit), sponsor carrega saldo
-- via Pix/boleto, campanha só é aprovada quando o saldo cobre o período
-- pedido. Ver routers/sponsor.ts::approveSponsorship pro gate de verdade.
-- ============================================================================

ALTER TABLE sponsors
  ADD COLUMN balance_cents integer NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  ADD COLUMN tax_id text; -- CPF/CNPJ opcional, só usado se o Mercado Pago exigir p/ Pix/boleto

-- Tentativas de pagamento no Mercado Pago — nem toda tentativa vira saldo
-- (Pix pode nunca ser pago, boleto expira). Só quando o status chega em
-- APPROVED (confirmado via webhook, nunca confiando só no corpo do POST —
-- ver http/mercadoPagoWebhook.ts) é que sponsor_ledger recebe uma entrada.
CREATE TABLE sponsor_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id    uuid NOT NULL REFERENCES sponsors(id),
  mp_payment_id text NOT NULL UNIQUE,
  method        text NOT NULL CHECK (method IN ('PIX', 'BOLETO')),
  amount_cents  integer NOT NULL CHECK (amount_cents > 0),
  status        text NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  qr_code       text,       -- Pix copia-e-cola
  boleto_url    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  paid_at       timestamptz
);
CREATE INDEX idx_sponsor_payments_sponsor ON sponsor_payments(sponsor_id, created_at DESC);

-- Movimentos CONFIRMADOS de saldo — só escrito quando o dinheiro de fato se
-- move (pagamento aprovado, campanha cobrada, estorno, ajuste manual do
-- admin). Mesmo espírito de auditoria do point_ledger (001_schema.sql), sem
-- hash-chain: aquilo é prova pública pro usuário, isso é registro interno de
-- negócio.
CREATE TABLE sponsor_ledger (
  id                   bigserial PRIMARY KEY,
  sponsor_id           uuid NOT NULL REFERENCES sponsors(id),
  delta_cents          integer NOT NULL,
  balance_after_cents  integer NOT NULL CHECK (balance_after_cents >= 0),
  reason               text NOT NULL CHECK (reason IN ('TOPUP','CAMPAIGN_CHARGE','REFUND','ADMIN_ADJUST')),
  sponsorship_id       uuid REFERENCES sponsorships(id),
  payment_id           uuid REFERENCES sponsor_payments(id),
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sponsor_ledger_sponsor ON sponsor_ledger(sponsor_id, id DESC);
