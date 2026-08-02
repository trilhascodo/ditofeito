-- ============================================================================
-- MIGRAÇÃO 039 — MAIS CANAIS DE COMPARTILHAMENTO
-- Estende market_share_events.channel (038_market_shares.sql) com as redes
-- pedidas além de WhatsApp/Telegram/Facebook — ver components/ShareRow.tsx
-- pro componente único que agora gera os botões nos 4 lugares que
-- compartilham algo (convite de grupo, card de vindicação de mercado/bolão,
-- botão geral de mercado).
-- ============================================================================

ALTER TABLE market_share_events DROP CONSTRAINT market_share_events_channel_check;
ALTER TABLE market_share_events ADD CONSTRAINT market_share_events_channel_check
  CHECK (channel IN ('WHATSAPP','TELEGRAM','FACEBOOK','X','LINKEDIN','PINTEREST',
                     'SNAPCHAT','INSTAGRAM','COPY_LINK','NATIVE'));
