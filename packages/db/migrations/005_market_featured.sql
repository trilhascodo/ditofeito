-- Slide de destaque na home (inspirado no carrossel do Polymarket — só o
-- layout, não o modelo de aposta: sem spread/combo/alavancagem). Curadoria
-- manual pelo admin; a query de fallback (mercados que fecham mais cedo)
-- cuida do caso de nada estar marcado.
ALTER TABLE markets ADD COLUMN featured boolean NOT NULL DEFAULT false;
CREATE INDEX idx_markets_featured ON markets(featured) WHERE featured;
