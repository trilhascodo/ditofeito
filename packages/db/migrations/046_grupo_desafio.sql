-- ============================================================================
-- 046 — "Desafiar amigos" (grupo-desafio de um mercado)
-- Mesmo modelo de grupo+convite+bolão de sempre (031/043), criado num clique
-- a partir da página do mercado: um grupo de propósito único com um bolão
-- WINNER sobre aquele mercado. Motivo: audiência — link público de mercado
-- quase não converte (funil 2026-09: 0,5% chegava ao cadastro); convite de
-- alguém conhecido pra "ver quem acerta" pede a participação da pessoa, e
-- entrar exige conta. kind só muda o texto do convite/card ("Fulano te
-- desafiou") e manda quem entra direto pro palpite — ver routers/grupos.ts.
-- ============================================================================

ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_kind_check;
ALTER TABLE groups ADD CONSTRAINT groups_kind_check CHECK (kind IN ('GRUPO', 'ENQUETE', 'DESAFIO'));
