-- ============================================================================
-- MIGRAÇÃO 020 — MEDIÇÃO DE AUDIÊNCIA DOS ANÚNCIOS
-- Impressão (card renderizado) e clique (link seguido), por patrocínio —
-- base pra negociar espaço e justificar preço com número real, não achismo.
-- Mesmo hash de visitante do page_views (sem cookie, sem terceiro).
-- ============================================================================

CREATE TABLE ad_events (
  id             bigserial PRIMARY KEY,
  sponsorship_id uuid NOT NULL REFERENCES sponsorships(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('IMPRESSION', 'CLICK')),
  visitor_hash   text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ad_events_sponsorship ON ad_events(sponsorship_id, kind, created_at);
