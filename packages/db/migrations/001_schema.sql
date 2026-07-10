-- ============================================================================
-- PLATAFORMA DE PREDIÇÃO REPUTACIONAL — SCHEMA PostgreSQL 16+
-- Mecanismo: LMSR (multi-resultado) | Pontos fictícios + Reputação separada
-- Stack alvo: TypeScript / tRPC / Zod / node-postgres
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid(), digest()

-- ----------------------------------------------------------------------------
-- 1. USUÁRIOS
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle        text NOT NULL UNIQUE CHECK (handle ~ '^[a-z0-9_]{3,30}$'),
  display_name  text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  avatar_url    text,
  bio           text,
  role          text NOT NULL DEFAULT 'USER'
                CHECK (role IN ('USER','MODERATOR','RESOLVER','ADMIN')),
  is_banned     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. LEDGER DE PONTOS (hash-encadeado, padrão CarToken)
--    Pontos = moeda gastável. NUNCA conversível em valor real (tese jurídica).
--    Saldo é derivado do ledger; balance_after é cache verificável.
-- ----------------------------------------------------------------------------
CREATE TABLE point_ledger (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id),
  delta         numeric(14,4) NOT NULL,           -- positivo = crédito
  balance_after numeric(14,4) NOT NULL CHECK (balance_after >= 0),
  reason        text NOT NULL CHECK (reason IN (
                  'SIGNUP_BONUS',     -- saldo inicial
                  'DAILY_BONUS',      -- login diário (retenção)
                  'TRADE_BUY',        -- débito por compra de shares
                  'TRADE_SELL',       -- crédito por venda de shares
                  'RESOLUTION_PAYOUT',-- crédito: shares vencedoras x 1 ponto
                  'MARKET_VOIDED',    -- devolução por anulação
                  'ADMIN_ADJUST'
                )),
  ref_type      text,                              -- 'trade' | 'market' | null
  ref_id        uuid,
  prev_hash     text NOT NULL,                     -- hash da entrada anterior do usuário
  entry_hash    text NOT NULL,                     -- sha256(prev_hash||user_id||delta||reason||created_at)
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_user ON point_ledger(user_id, id DESC);

-- ----------------------------------------------------------------------------
-- 3. REPUTAÇÃO (separada, não gastável, não transferível)
--    Atualizada apenas na resolução de mercados. Brier multi-resultado.
-- ----------------------------------------------------------------------------
CREATE TABLE user_reputation (
  user_id         uuid PRIMARY KEY REFERENCES users(id),
  resolved_count  integer NOT NULL DEFAULT 0,      -- previsões resolvidas
  brier_sum       numeric(12,6) NOT NULL DEFAULT 0,-- soma dos Brier (menor=melhor)
  brier_mean      numeric(8,6),                    -- brier_sum / resolved_count
  skill_score     numeric(8,4) NOT NULL DEFAULT 0, -- vs. baseline do mercado (ver reputation_events)
  streak_current  integer NOT NULL DEFAULT 0,
  streak_best     integer NOT NULL DEFAULT 0,
  calibration     jsonb NOT NULL DEFAULT '[]',     -- bins [{p_lo,p_hi,n,hit_rate}] p/ gráfico público
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Evento de pontuação por (usuário, mercado resolvido) — trilha auditável
CREATE TABLE reputation_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  market_id     uuid NOT NULL,                     -- FK adicionada após markets
  brier         numeric(8,6) NOT NULL,             -- Σ(p_i - o_i)² do usuário
  market_brier  numeric(8,6) NOT NULL,             -- Brier do preço final do mercado (baseline)
  skill_delta   numeric(8,4) NOT NULL,             -- (market_brier - brier): >0 = bateu o mercado
  weight        numeric(6,4) NOT NULL DEFAULT 1,   -- peso por liquidez/dificuldade
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, market_id)
);

-- ----------------------------------------------------------------------------
-- 4. TAXONOMIA E GRUPOS
--    categories: árvore (Política > Eleições 2026 > MA > Senado)
--    market_groups: agrupa mercados correlatos p/ navegação e índice
-- ----------------------------------------------------------------------------
CREATE TABLE categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  parent_id  uuid REFERENCES categories(id),
  vertical   text NOT NULL CHECK (vertical IN
             ('POLITICA','ESPORTE','ENTRETENIMENTO','ECONOMIA','OUTROS')),
  brand_safe boolean NOT NULL DEFAULT true         -- controla elegibilidade p/ ads
);

CREATE TABLE market_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  title       text NOT NULL,                       -- "Eleições 2026 — Senado/MA"
  category_id uuid NOT NULL REFERENCES categories(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5. CANDIDATOS (registro espelhado do TSE — chave da vertical eleitoral)
--    Importável dos dados abertos do TSE (candidaturas por UF/cargo).
-- ----------------------------------------------------------------------------
CREATE TABLE candidates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tse_sq_candidato bigint UNIQUE,                  -- SQ_CANDIDATO dos dados abertos
  name             text NOT NULL,
  ballot_name      text NOT NULL,                  -- nome de urna
  number           integer,                        -- número de urna
  party            text NOT NULL,                  -- sigla
  office           text NOT NULL CHECK (office IN (
                     'PRESIDENTE','GOVERNADOR','SENADOR',
                     'DEP_FEDERAL','DEP_ESTADUAL','PREFEITO','VEREADOR')),
  uf               char(2),
  municipality_ibge integer,                       -- p/ mercados municipais
  photo_url        text,
  candidacy_status text NOT NULL DEFAULT 'REGISTRADO'
                   CHECK (candidacy_status IN
                   ('REGISTRADO','DEFERIDO','INDEFERIDO','RENUNCIOU','FALECIDO')),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_candidates_race ON candidates(office, uf, candidacy_status);

-- ----------------------------------------------------------------------------
-- 6. MERCADOS
--    type BINARY  -> exatamente 2 outcomes (SIM/NÃO)
--    type MULTI   -> N outcomes (candidatos + "OUTROS" catchall)
--    LMSR: preço_i = exp(q_i/b) / Σ exp(q_j/b)
--    liquidity_b: maior b = preço mais estável; regra prática b ≈ 30–50·ln(N)
-- ----------------------------------------------------------------------------
CREATE TABLE markets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text NOT NULL UNIQUE,
  title               text NOT NULL,               -- a pergunta
  description         text,
  category_id         uuid NOT NULL REFERENCES categories(id),
  group_id            uuid REFERENCES market_groups(id),
  type                text NOT NULL CHECK (type IN ('BINARY','MULTI')),
  liquidity_b         numeric(12,4) NOT NULL CHECK (liquidity_b > 0),
  status              text NOT NULL DEFAULT 'DRAFT' CHECK (status IN
                      ('DRAFT','OPEN','CLOSED','RESOLVED','VOIDED')),
  -- Governança de resolução: obrigatórios ANTES de publicar (regra anti-ambiguidade)
  resolution_criteria text NOT NULL,               -- critério verificável, redigido
  resolution_source   text NOT NULL,               -- fonte nomeada: "TSE", "DOU", "CBF"
  close_at            timestamptz NOT NULL,        -- fim das negociações
  resolve_by          timestamptz NOT NULL,        -- prazo p/ resolver ou anular
  -- Compliance eleitoral (Lei 9.504/97): força disclaimer na UI
  is_electoral        boolean NOT NULL DEFAULT false,
  created_by          uuid NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (resolve_by > close_at)
);
CREATE INDEX idx_markets_status ON markets(status, close_at);
CREATE INDEX idx_markets_group  ON markets(group_id);

ALTER TABLE reputation_events
  ADD CONSTRAINT fk_repev_market FOREIGN KEY (market_id) REFERENCES markets(id);

CREATE TABLE market_outcomes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id     uuid NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  label         text NOT NULL,                     -- "SIM" | "NÃO" | nome do candidato
  candidate_id  uuid REFERENCES candidates(id),    -- vínculo TSE quando aplicável
  q             numeric(18,6) NOT NULL DEFAULT 0,  -- quantidade LMSR em circulação
  is_catchall   boolean NOT NULL DEFAULT false,    -- "OUTROS" p/ cauda longa
  display_order integer NOT NULL DEFAULT 0,
  UNIQUE (market_id, label)
);
CREATE INDEX idx_outcomes_market ON market_outcomes(market_id);

-- ----------------------------------------------------------------------------
-- 7. NEGOCIAÇÕES E POSIÇÕES
--    Trade executa em transação serializable: lê q's -> calcula custo LMSR
--    -> atualiza q -> debita/credita ledger -> grava trade + snapshot de preço.
-- ----------------------------------------------------------------------------
CREATE TABLE trades (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id    uuid NOT NULL REFERENCES markets(id),
  outcome_id   uuid NOT NULL REFERENCES market_outcomes(id),
  user_id      uuid NOT NULL REFERENCES users(id),
  side         text NOT NULL CHECK (side IN ('BUY','SELL')),
  shares       numeric(18,6) NOT NULL CHECK (shares > 0),
  cost_points  numeric(14,4) NOT NULL,             -- pontos movidos (>0 buy, <0 sell)
  price_before numeric(8,6) NOT NULL,              -- prob. do outcome antes
  price_after  numeric(8,6) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_trades_market ON trades(market_id, created_at DESC);
CREATE INDEX idx_trades_user   ON trades(user_id, created_at DESC);

-- Posição agregada (cache; verdade deriva de trades)
CREATE TABLE positions (
  user_id    uuid NOT NULL REFERENCES users(id),
  market_id  uuid NOT NULL REFERENCES markets(id),
  outcome_id uuid NOT NULL REFERENCES market_outcomes(id),
  shares     numeric(18,6) NOT NULL DEFAULT 0 CHECK (shares >= 0),
  cost_basis numeric(14,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, market_id, outcome_id)
);

-- ----------------------------------------------------------------------------
-- 8. RESOLUÇÃO (centralizada, transparente, auditável)
-- ----------------------------------------------------------------------------
CREATE TABLE resolutions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id           uuid NOT NULL UNIQUE REFERENCES markets(id),
  kind                text NOT NULL CHECK (kind IN ('RESOLVED','VOIDED')),
  resolved_outcome_id uuid REFERENCES market_outcomes(id), -- null se VOIDED
  justification       text NOT NULL,               -- pública, obrigatória
  source_url          text NOT NULL,               -- link da evidência
  resolved_by         uuid NOT NULL REFERENCES users(id),
  resolved_at         timestamptz NOT NULL DEFAULT now(),
  CHECK ( (kind = 'RESOLVED' AND resolved_outcome_id IS NOT NULL)
       OR (kind = 'VOIDED'   AND resolved_outcome_id IS NULL) )
);

-- ----------------------------------------------------------------------------
-- 9. HISTÓRICO DE PREÇOS (alimenta sparklines, debate e o ÍNDICE citável)
--    Gravar snapshot a cada trade + job horário p/ mercados parados.
--    Volume alto: particionar por mês quando necessário.
-- ----------------------------------------------------------------------------
CREATE TABLE price_snapshots (
  market_id  uuid NOT NULL REFERENCES markets(id),
  outcome_id uuid NOT NULL REFERENCES market_outcomes(id),
  price      numeric(8,6) NOT NULL,
  ts         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id, outcome_id, ts)
);

-- ----------------------------------------------------------------------------
-- 10. DEBATE — comentário carrega a posição do autor (skin in the game visível)
-- ----------------------------------------------------------------------------
CREATE TABLE comments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id         uuid NOT NULL REFERENCES markets(id),
  user_id           uuid NOT NULL REFERENCES users(id),
  parent_id         uuid REFERENCES comments(id),
  body              text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  -- snapshot no momento do post: [{outcome_label, shares, price_at_post}]
  position_snapshot jsonb NOT NULL DEFAULT '[]',
  author_rep_snapshot numeric(8,6),                -- brier_mean no momento do post
  is_hidden         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_market ON comments(market_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 11. RECEITA — patrocínio nativo por mercado/grupo
-- ----------------------------------------------------------------------------
CREATE TABLE sponsors (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name      text NOT NULL,
  logo_url  text,
  site_url  text,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE sponsorships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id  uuid NOT NULL REFERENCES sponsors(id),
  market_id   uuid REFERENCES markets(id),
  group_id    uuid REFERENCES market_groups(id),
  label       text NOT NULL DEFAULT 'Apresentado por',
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  CHECK (market_id IS NOT NULL OR group_id IS NOT NULL),
  CHECK (ends_at > starts_at)
);

-- ----------------------------------------------------------------------------
-- 12. PRODUTO DE DADOS — índice agregado citável (B2B)
--     Séries publicáveis (ex.: "Índice Eleitoral — Senado/MA") com metodologia
--     registrada em jsonb (transparência = credibilidade p/ citação).
-- ----------------------------------------------------------------------------
CREATE TABLE index_series (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  title       text NOT NULL,
  group_id    uuid REFERENCES market_groups(id),
  methodology jsonb NOT NULL,                      -- pesos, filtros, fórmula
  is_public   boolean NOT NULL DEFAULT true
);

CREATE TABLE index_points (
  series_id uuid NOT NULL REFERENCES index_series(id),
  ts        timestamptz NOT NULL,
  values    jsonb NOT NULL,     -- {"candidato_x":0.32,"candidato_y":0.28,...}
  PRIMARY KEY (series_id, ts)
);

CREATE TABLE api_clients (                          -- acesso B2B ao índice
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  key_hash   text NOT NULL UNIQUE,
  scopes     text[] NOT NULL DEFAULT '{index:read}',
  rate_limit integer NOT NULL DEFAULT 1000,        -- req/dia
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
