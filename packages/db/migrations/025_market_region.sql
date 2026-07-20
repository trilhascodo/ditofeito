-- ============================================================================
-- MIGRAÇÃO 025 — REGIONALIZAÇÃO DE MERCADOS
-- A plataforma é nacional (mercados em várias UFs simultaneamente). Home
-- passa a permitir filtrar por estado, mantendo "Todos" como visão padrão.
-- Mesmo padrão de users.region_uf / sponsorships.region_uf (019): texto
-- livre, sem geo-IP, autodeclarado — aqui, atribuído pelo gerador/editoria.
-- NULL = mercado nacional (ex.: Presidente, esporte/cultura sem recorte
-- estadual) — sempre aparece, em qualquer filtro de estado (ver market.ts).
-- ============================================================================

ALTER TABLE markets ADD COLUMN IF NOT EXISTS region_uf text;
CREATE INDEX IF NOT EXISTS idx_markets_region ON markets(region_uf);

-- Backfill: mercados eleitorais já ligados a candidato herdam a UF do
-- candidato (binários "será eleito?" e disputas MULTI só têm candidatos de
-- uma única UF por construção — gerador.ts agrupa por (office, uf)).
-- PRESIDENTE fica NULL (candidates.uf já é NULL nesse cargo) = nacional.
UPDATE markets m SET region_uf = c.uf
  FROM market_outcomes mo JOIN candidates c ON c.id = mo.candidate_id
 WHERE mo.market_id = m.id AND c.uf IS NOT NULL AND m.region_uf IS NULL;
