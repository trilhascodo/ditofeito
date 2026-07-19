-- ============================================================================
-- MIGRAÇÃO 017 — CARD DE VINDICAÇÃO
-- Pico emocional da plataforma: quem acertou pode compartilhar um card
-- pessoal ("eu disse X%, antes de todo mundo saber"). share_token é opaco
-- (não dá pra adivinhar o de outra pessoa) e não expira — a prova de que
-- alguém tinha razão não perde validade.
-- ============================================================================

CREATE TABLE vindication_cards (
  user_id     uuid NOT NULL REFERENCES users(id),
  market_id   uuid NOT NULL REFERENCES markets(id),
  share_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, market_id)
);
CREATE UNIQUE INDEX idx_vindication_share_token ON vindication_cards(share_token);
