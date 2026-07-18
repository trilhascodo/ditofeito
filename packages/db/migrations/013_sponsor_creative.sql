-- ============================================================================
-- MIGRAÇÃO 013 — ARTE PRONTA DO PATROCINADOR (CREATIVE)
-- Muitos anunciantes mandam a peça já finalizada (fundo, headline, CTA
-- embutidos) em vez de só logo + nome pra gente compor. creative_url é
-- opcional: quando presente, o card lateral da home (.patro-slot) exibe a
-- imagem cheia em vez do layout composto logo+nome+CTA.
-- ============================================================================

ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS creative_url text;
