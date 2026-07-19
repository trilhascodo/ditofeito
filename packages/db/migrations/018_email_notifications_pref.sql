-- ============================================================================
-- MIGRAÇÃO 018 — PREFERÊNCIA DE E-MAIL DE NOTIFICAÇÃO
-- Opt-out simples: por padrão todo mundo recebe (é o gatilho que traz de
-- volta quem não visita o site sozinho), mas o usuário pode desligar no
-- perfil.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_notifications boolean NOT NULL DEFAULT true;
