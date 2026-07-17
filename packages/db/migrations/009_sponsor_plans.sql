-- ============================================================================
-- MIGRAÇÃO 009 — PLANOS DE ANUNCIANTE + PAINEL DE AUTOATENDIMENTO
-- Papel SPONSOR (conta normal vinculada a um sponsor), plano do sponsor
-- (define limite de redes sociais no autoatendimento) e as redes sociais
-- em si, exibidas nos anúncios.
-- ============================================================================

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('USER', 'MODERATOR', 'RESOLVER', 'ADMIN', 'SPONSOR'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS sponsor_id uuid REFERENCES sponsors(id);

ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'BASICO'
  CHECK (plan IN ('BASICO', 'PROFISSIONAL', 'PREMIUM'));

CREATE TABLE IF NOT EXISTS sponsor_social_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id    uuid NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
  platform      text NOT NULL CHECK (platform IN
                ('INSTAGRAM', 'X', 'TIKTOK', 'YOUTUBE', 'FACEBOOK', 'WHATSAPP')),
  url           text NOT NULL,
  display_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sponsor_social_links_sponsor ON sponsor_social_links(sponsor_id, display_order);
