-- Patrocínio de faixa da home (site-wide, não vinculado a um mercado/grupo
-- específico) + notícias relacionadas por mercado, curadas manualmente pelo
-- admin ("Leitura relacionada" na página do mercado).

ALTER TABLE sponsorships ADD COLUMN is_home boolean NOT NULL DEFAULT false;
ALTER TABLE sponsorships DROP CONSTRAINT sponsorships_check;
ALTER TABLE sponsorships ADD CONSTRAINT sponsorships_check
  CHECK (market_id IS NOT NULL OR group_id IS NOT NULL OR is_home);

CREATE TABLE market_news (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id  uuid NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  title      text NOT NULL,
  url        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_news_market ON market_news(market_id, created_at DESC);
