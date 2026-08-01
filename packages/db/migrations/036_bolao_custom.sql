-- ============================================================================
-- MIGRAÇÃO 036 — BOLÃO DE EVENTO PRÓPRIO DO GRUPO
-- Até aqui todo bolão precisava de um mercado já existente no catálogo
-- curado (031_boloes.sql). Isso trava o caso mais comum de bolão casual
-- entre amigos ("quem ganha o campeonato de sinuca do escritório") — nunca
-- vai estar no catálogo público. market_id vira opcional; quando NULL, os
-- custom_* abaixo descrevem o evento que o próprio grupo definiu.
--
-- Continua 100% dentro do modelo de bolão que já existe: sem LMSR, sem
-- pontos em jogo, sem ranking público, sem exposição legal (privado, só
-- membro do grupo vê) — decisão consciente de NÃO deixar usuário criar
-- mercado público de verdade (isso seria uma mudança bem maior/arriscada,
-- explicitamente descartada).
-- ============================================================================

ALTER TABLE boloes
  ALTER COLUMN market_id DROP NOT NULL,
  ADD COLUMN custom_title text,
  ADD COLUMN custom_criteria text,
  ADD COLUMN custom_close_at timestamptz,
  ADD COLUMN resolved_custom_outcome_id uuid,
  ADD CONSTRAINT boloes_market_xor_custom_chk CHECK (
    (market_id IS NOT NULL AND custom_title IS NULL)
    OR (market_id IS NULL AND custom_title IS NOT NULL AND custom_criteria IS NOT NULL AND custom_close_at IS NOT NULL)
  );

-- Opções de "quem ganha" pra bolão custom WINNER — equivalente de
-- market_outcomes, mas escopado ao bolão, não a um mercado curado.
CREATE TABLE bolao_custom_outcomes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bolao_id      uuid NOT NULL REFERENCES boloes(id) ON DELETE CASCADE,
  label         text NOT NULL,
  display_order integer NOT NULL DEFAULT 0
);

ALTER TABLE boloes ADD CONSTRAINT boloes_resolved_custom_outcome_fkey
  FOREIGN KEY (resolved_custom_outcome_id) REFERENCES bolao_custom_outcomes(id);

-- guess_outcome_id passa a poder apontar pra market_outcomes OU pra
-- bolao_custom_outcomes dependendo do bolão — uma FK só não dá conta dos
-- dois, então a integridade migra pra aplicação (routers/grupos.ts). Fecha
-- de quebra um buraco que já existia: antes disso nada validava que o
-- outcome pertencia AO MERCADO do bolão, só que existia em algum lugar.
ALTER TABLE bolao_palpites DROP CONSTRAINT bolao_palpites_guess_outcome_id_fkey;

-- Precisão de dedupe do lembrete de prazo (jobs/bolaoReminder.ts): antes
-- reaproveitava notifications.market_id, que não existe pra bolão custom
-- (NULL nunca bate em NULL num WHERE — geraria lembrete repetido toda
-- hora). bolao_id resolve os dois casos e de quebra permite link direto
-- pro bolão certo no sino, não só pro grupo.
ALTER TABLE notifications ADD COLUMN bolao_id uuid REFERENCES boloes(id) ON DELETE CASCADE;
