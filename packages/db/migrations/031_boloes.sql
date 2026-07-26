-- ============================================================================
-- MIGRAÇÃO 031 — GRUPOS E BOLÃO
-- Camada social sobre os mercados que já existem: usuário cria um grupo
-- privado (entra por invite_code, sem fila de aprovação), o grupo escolhe UM
-- mercado já existente e roda um "bolão" — cada membro dá um palpite, sem
-- comprar/vender share nenhuma (não é LMSR, é só previsão simples).
--
-- Três formatos (guess_type): WINNER (reaproveita o outcome do próprio
-- mercado — "quem ganha"), SCORE (dois números — "qual o placar"), NUMBER
-- (um número livre — "qual a diferença de votos"). Resolução só depois que o
-- mercado subjacente vira RESOLVED (ou VOIDED, aí o bolão só cancela);
-- placar/número real (que o schema de markets não guarda) é preenchido por
-- quem criou o bolão depois disso — ver domain/bolao.ts.
--
-- Vencedor = quem acertou em cheio; 2+ acertadores dividem a vitória (sem
-- payout em pontos — é reputação, a plataforma não faz aposta em pontos);
-- ninguém acerta = ninguém venceu (não cai pra "mais perto ganha").
-- ============================================================================

CREATE TABLE IF NOT EXISTS groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  invite_code text NOT NULL UNIQUE,
  created_by  uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id  uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS boloes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  market_id           uuid NOT NULL REFERENCES markets(id),
  created_by          uuid NOT NULL REFERENCES users(id),
  guess_type          text NOT NULL CHECK (guess_type IN ('WINNER','SCORE','NUMBER')),
  -- Só SCORE/NUMBER preenchem isso, só depois que markets.status='RESOLVED'
  -- (WINNER lê o vencedor direto de resolutions.resolved_outcome_id).
  resolved_home_score integer,
  resolved_away_score integer,
  resolved_number     numeric(14,2),
  resolved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, market_id, guess_type)
);
CREATE INDEX IF NOT EXISTS idx_boloes_group ON boloes(group_id);
CREATE INDEX IF NOT EXISTS idx_boloes_market ON boloes(market_id);

CREATE TABLE IF NOT EXISTS bolao_palpites (
  bolao_id         uuid NOT NULL REFERENCES boloes(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id),
  guess_outcome_id uuid REFERENCES market_outcomes(id),
  guess_home_score integer,
  guess_away_score integer,
  guess_number     numeric(14,2),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bolao_id, user_id)
);
