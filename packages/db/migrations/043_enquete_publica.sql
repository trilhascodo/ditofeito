-- ============================================================================
-- MIGRAÇÃO 043 — ENQUETE PÚBLICA (grupo de propósito único, divulgável fora)
-- Continua 100% dentro do modelo de bolão/grupo que já existe (031/036) —
-- NÃO é um catálogo público novo, é o mesmo grupo+convite de sempre, só que
-- criado num passo só pra um propósito específico: alguém quer uma enquete
-- pra divulgar no Instagram/Facebook/etc. com a credibilidade de voto
-- verificado (login obrigatório pra palpitar, sem exposição do catálogo
-- curado). kind só existe pra saber quando o card/preview de convite deve
-- mostrar a pergunta do bolão em vez do resumo genérico do grupo — ver
-- routers/grupos.ts::previewByCode e http/inviteCard.ts.
-- ============================================================================

ALTER TABLE groups
  ADD COLUMN kind text NOT NULL DEFAULT 'GRUPO' CHECK (kind IN ('GRUPO', 'ENQUETE'));
