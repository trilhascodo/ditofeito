-- ============================================================================
-- MIGRAÇÃO 022 — DENÚNCIA E MODERAÇÃO DE COMENTÁRIO
-- comments.is_hidden já existia desde o F0, sem UI nenhuma em cima. Isso
-- fecha o ciclo: usuário denuncia, MODERATOR/RESOLVER/ADMIN revisa e decide
-- ocultar — nunca automático (denúncia não oculta sozinha, evita brigada
-- silenciando alguém só por volume de denúncia).
-- ============================================================================

CREATE TABLE comment_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id),
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);
CREATE INDEX idx_comment_reports_comment ON comment_reports(comment_id);
