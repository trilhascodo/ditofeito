-- ============================================================================
-- MIGRAÇÃO 016 — NOTIFICAÇÕES
-- Traz o usuário de volta sem ele precisar lembrar sozinho: mercado que ele
-- tem posição resolveu/foi anulado, ou alguém comentou num mercado que ele
-- previu (o "desafio" fica visível, não silencioso). Sem push/e-mail por
-- enquanto — só central in-app (sino no header).
-- ============================================================================

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  kind        text NOT NULL CHECK (kind IN ('MARKET_RESOLVED', 'MARKET_VOIDED', 'NEW_COMMENT')),
  market_id   uuid REFERENCES markets(id) ON DELETE CASCADE,
  comment_id  uuid REFERENCES comments(id) ON DELETE CASCADE,
  body        text NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
