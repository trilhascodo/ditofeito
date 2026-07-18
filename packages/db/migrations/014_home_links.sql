-- ============================================================================
-- MIGRAÇÃO 014 — LINKS ÚTEIS DA COLUNA LATERAL DA HOME
-- Preenche o espaço vazio abaixo dos anúncios quando a lateral fica mais
-- curta que o conteúdo principal — mesmo princípio do market_news (curadoria
-- manual do admin, sem puxar favicon/thumbnail de terceiro).
-- ============================================================================

CREATE TABLE home_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  url           text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_home_links_order ON home_links(display_order, created_at);
