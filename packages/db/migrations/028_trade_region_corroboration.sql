-- ============================================================================
-- MIGRAÇÃO 028 — CORROBORAÇÃO GEOGRÁFICA DE PREVISÕES
-- Opt-in explícito (users.share_location_on_trades, default false — nunca
-- automático, usuário liga no Perfil e confirma a permissão do navegador
-- naquele momento): quando ativo, cada previsão carrega a UF sugerida por
-- geolocalização do dispositivo (mesma aproximação sem geo-IP/terceiro de
-- apps/web/src/lib/geoUf.ts — distância até a capital mais próxima).
-- Serve só como corroboração estatística agregada ("X% das previsões vieram
-- de UF X") e como recorte analítico por região — não é fonte de resolução
-- nem alimenta contestação (esse fluxo não existe na plataforma).
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS share_location_on_trades boolean NOT NULL DEFAULT false;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS region_uf text;
CREATE INDEX IF NOT EXISTS idx_trades_region ON trades(market_id, region_uf) WHERE region_uf IS NOT NULL;
