-- ============================================================================
-- MIGRAÇÃO 019 — SEGMENTAÇÃO REGIONAL
-- Dois lados: o visitante pode se autodeclarar (opcional, sem geo-IP —
-- mesma filosofia de zero dependência de terceiro do resto do produto), e o
-- patrocinador escolhe o escopo do espaço de home que contratou (nacional
-- por padrão = comportamento de sempre). "Municipal" exige UF pra evitar
-- Codó/MA e Codó/outro-estado colidindo.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS region_uf text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS region_city text;

ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS region_scope text NOT NULL DEFAULT 'NACIONAL'
  CHECK (region_scope IN ('NACIONAL', 'ESTADUAL', 'MUNICIPAL'));
ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS region_uf text;
ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS region_city text;

ALTER TABLE sponsorships DROP CONSTRAINT IF EXISTS sponsorships_region_check;
ALTER TABLE sponsorships ADD CONSTRAINT sponsorships_region_check CHECK (
  region_scope = 'NACIONAL'
  OR (region_scope = 'ESTADUAL' AND region_uf IS NOT NULL)
  OR (region_scope = 'MUNICIPAL' AND region_uf IS NOT NULL AND region_city IS NOT NULL)
);
