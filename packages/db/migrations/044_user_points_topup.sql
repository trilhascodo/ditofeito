-- ============================================================================
-- MIGRAÇÃO 044 — COMPRA DE PONTOS PELO USUÁRIO COMUM (moeda recreativa)
-- Até aqui ponto só entrava por SIGNUP_BONUS/DAILY_BONUS/RESOLUTION_PAYOUT —
-- nunca por dinheiro de verdade (001_schema.sql: "NUNCA conversível em valor
-- real"). Essa tese continua de pé, só que ela sempre foi sobre o sentido
-- ponto -> dinheiro (não existe, não vai existir, sem saque/resgate em lugar
-- nenhum do sistema). Dinheiro -> ponto é uma direção diferente: aquisição de
-- moeda recreativa gastável dentro da plataforma, mesma natureza de comprar
-- Robux/Gemas/créditos de qualquer app — decisão de produto validada com
-- advogado (Dr. Ricardo Torres) antes desta migração.
--
-- Mesmo padrão de 040_sponsor_billing.sql/041_sponsor_card_payment.sql
-- (sponsor_payments), só que sponsor é B2B/patrocínio de conteúdo — isso
-- aqui é consumidor final comprando saldo pra apostar em previsão, categoria
-- de risco distinta, tabela própria de propósito (nunca reaproveitar
-- sponsor_payments pra usuário comum).
-- ============================================================================

ALTER TABLE point_ledger DROP CONSTRAINT point_ledger_reason_check;
ALTER TABLE point_ledger ADD CONSTRAINT point_ledger_reason_check CHECK (reason IN (
  'SIGNUP_BONUS', 'DAILY_BONUS', 'TRADE_BUY', 'TRADE_SELL', 'RESOLUTION_PAYOUT',
  'MARKET_VOIDED', 'ADMIN_ADJUST',
  'TOPUP' -- crédito por compra de pontos com dinheiro real (ver domain/pointsPurchase.ts)
));

CREATE TABLE user_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  mp_payment_id text NOT NULL UNIQUE,
  method        text NOT NULL CHECK (method IN ('PIX', 'BOLETO', 'CARD')),
  amount_cents  integer NOT NULL CHECK (amount_cents > 0),
  -- Pontos que esse pagamento credita — gravado na hora da cobrança (não
  -- recalculado na hora de creditar), pra um pagamento pendente não mudar de
  -- valor se a taxa de conversão for ajustada entre a criação e a aprovação.
  points        numeric(14,4) NOT NULL CHECK (points > 0),
  status        text NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  qr_code       text,       -- Pix copia-e-cola
  boleto_url    text,
  card_last4    text,
  card_brand    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  paid_at       timestamptz
);
CREATE INDEX idx_user_payments_user ON user_payments(user_id, created_at DESC);
