-- ============================================================================
-- MIGRAÇÃO 038 — RASTREAMENTO DE COMPARTILHAMENTO DE MERCADO
-- Alimenta o painel "Mais compartilhados" da Home (routers/market.ts,
-- mostShared) — mesmo espírito de page_views (006) e ad_events (020): sem
-- PII, hash de visitante, não é analytics de terceiro.
-- ============================================================================

CREATE TABLE market_share_events (
  id           bigserial PRIMARY KEY,
  market_id    uuid NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  channel      text NOT NULL CHECK (channel IN ('WHATSAPP','TELEGRAM','FACEBOOK','COPY_LINK','NATIVE')),
  visitor_hash text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_share_events_market ON market_share_events(market_id, created_at);
