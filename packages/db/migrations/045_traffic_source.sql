-- ============================================================================
-- 045 — Origem do tráfego e do cadastro
-- Funil de 2026-09 (infra/scripts/funil.sql): 95% das visitas chegam sem
-- referrer (link aberto dentro do WhatsApp/Instagram não manda), e o hash de
-- visitante troca todo dia — então não dava pra saber de qual canal vinha
-- ninguém, nem ligar visita a cadastro. Agora o front lê ?origem= / utm_source
-- (e fbclid/gclid) da URL de chegada: vai em page_views.source pra cada
-- visita, e o primeiro que a pessoa trouxe vai em users.signup_source.
-- Texto livre curto e saneado no backend (a-z0-9_.-), nunca PII.
-- ============================================================================

ALTER TABLE page_views ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE users      ADD COLUMN IF NOT EXISTS signup_source text;
