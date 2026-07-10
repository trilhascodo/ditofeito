-- ============================================================================
-- MIGRAÇÃO 002 — FASE 1 (pré-candidatura) + RECONCILIAÇÃO TSE (fase 2)
-- Princípio: a fase 1 captura exatamente os campos que o consulta_cand do TSE
-- oferecerá, para que o match da fase 2 seja majoritariamente determinístico.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent não é IMMUTABLE por padrão; wrapper p/ usar em coluna gerada/índice
CREATE OR REPLACE FUNCTION f_norm_name(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT trim(regexp_replace(
           upper(unaccent('unaccent', coalesce(t,''))),
           '[^A-Z0-9 ]| +', ' ', 'g'))
$$;

-- ----------------------------------------------------------------------------
-- 1. CANDIDATES: ciclo de vida ampliado + campos de reconciliação
-- ----------------------------------------------------------------------------
ALTER TABLE candidates
  DROP CONSTRAINT IF EXISTS candidates_candidacy_status_check;

ALTER TABLE candidates
  ADD CONSTRAINT candidates_candidacy_status_check CHECK (candidacy_status IN (
    'PRE_ANUNCIADO',    -- fase 1: cadastrado por curadoria/comunidade c/ fonte
    'PRE_REIVINDICADO', -- fase 1: perfil reivindicado pelo próprio (dados fortes)
    'REGISTRADO',       -- fase 2: casado com registro TSE
    'DEFERIDO','INDEFERIDO','RENUNCIOU','FALECIDO',
    'NAO_REGISTROU'     -- fase 2: existia na fase 1, não apareceu no TSE
  ));

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS public_name   text,           -- como é conhecido ("Zé do Posto")
  ADD COLUMN IF NOT EXISTS birth_date    date,           -- chave quase-determinística
  ADD COLUMN IF NOT EXISTS source_url    text,           -- evidência pública do anúncio (fase 1)
  ADD COLUMN IF NOT EXISTS claimed_by    uuid REFERENCES users(id), -- reivindicação
  ADD COLUMN IF NOT EXISTS norm_full_name   text GENERATED ALWAYS AS (f_norm_name(name)) STORED,
  ADD COLUMN IF NOT EXISTS norm_public_name text GENERATED ALWAYS AS (f_norm_name(public_name)) STORED;

CREATE INDEX IF NOT EXISTS idx_cand_norm_full  ON candidates USING gin (norm_full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cand_block      ON candidates (uf, office, candidacy_status);

-- Aliases: apelidos/variações sugeridos pela comunidade (todos entram no match)
CREATE TABLE IF NOT EXISTS candidate_aliases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  alias        text NOT NULL,
  norm_alias   text GENERATED ALWAYS AS (f_norm_name(alias)) STORED,
  source_url   text,
  created_by   uuid REFERENCES users(id),
  UNIQUE (candidate_id, norm_alias)
);
CREATE INDEX IF NOT EXISTS idx_alias_trgm ON candidate_aliases USING gin (norm_alias gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 2. STAGING TSE: espelho bruto do consulta_cand (reimportável por upsert)
--    Import: latin-1, ';', aspas — mesmo padrão de parsing do Educacenso.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tse_staging (
  sq_candidato     bigint PRIMARY KEY,               -- SQ_CANDIDATO
  nm_candidato     text NOT NULL,                    -- nome civil
  nm_urna          text NOT NULL,                    -- nome de urna
  nr_candidato     integer,
  sg_partido       text NOT NULL,
  ds_cargo         text NOT NULL,                    -- valor bruto TSE
  office           text NOT NULL,                    -- mapeado p/ enum interno
  sg_uf            char(2) NOT NULL,
  dt_nascimento    date,
  ds_situacao      text,                             -- deferido/indeferido...
  file_version     text NOT NULL,                    -- data/hash do arquivo importado
  imported_at      timestamptz NOT NULL DEFAULT now(),
  norm_nm_candidato text GENERATED ALWAYS AS (f_norm_name(nm_candidato)) STORED,
  norm_nm_urna      text GENERATED ALWAYS AS (f_norm_name(nm_urna)) STORED
);
CREATE INDEX IF NOT EXISTS idx_tse_block ON tse_staging (sg_uf, office);
CREATE INDEX IF NOT EXISTS idx_tse_nm    ON tse_staging USING gin (norm_nm_candidato gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tse_urna  ON tse_staging USING gin (norm_nm_urna gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 3. MATCHES: proposta -> confirmação, com trilha completa de auditoria
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS candidate_matches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  uuid   NOT NULL REFERENCES candidates(id),
  sq_candidato  bigint NOT NULL REFERENCES tse_staging(sq_candidato),
  method        text   NOT NULL CHECK (method IN ('EXACT','FUZZY','MANUAL')),
  score         numeric(5,4) NOT NULL,               -- score composto [0,1]
  score_detail  jsonb  NOT NULL,                     -- componentes p/ auditoria
  status        text   NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING','CONFIRMED','REJECTED')),
  decided_by    uuid REFERENCES users(id),           -- null se automático
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, sq_candidato)
);
-- 1:1 quando confirmado — cada lado casa no máximo uma vez
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_cand
  ON candidate_matches (candidate_id) WHERE status = 'CONFIRMED';
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_tse
  ON candidate_matches (sq_candidato) WHERE status = 'CONFIRMED';

-- ----------------------------------------------------------------------------
-- 4. GERAÇÃO DE PARES CANDIDATOS (blocking + trigram no próprio Postgres)
--    Retorna pares acima de um piso de similaridade dentro do bloco (UF,cargo),
--    considerando civil×civil, público×urna e alias×urna. O score final e a
--    classificação em tiers ficam no aplicativo (matcher.ts).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION f_match_pairs(min_sim real DEFAULT 0.45)
RETURNS TABLE (
  candidate_id uuid, sq_candidato bigint,
  sim_civil real, sim_urna real, best_alias_sim real,
  party_equal boolean, birth_equal boolean, birth_known boolean,
  cand_tokens text, tse_tokens text
) LANGUAGE sql STABLE AS $$
  SELECT c.id, t.sq_candidato,
         similarity(c.norm_full_name,  t.norm_nm_candidato)          AS sim_civil,
         similarity(coalesce(c.norm_public_name, c.norm_full_name),
                    t.norm_nm_urna)                                  AS sim_urna,
         coalesce((SELECT max(similarity(a.norm_alias, t.norm_nm_urna))
                     FROM candidate_aliases a
                    WHERE a.candidate_id = c.id), 0)                 AS best_alias_sim,
         (c.party = t.sg_partido)                                    AS party_equal,
         (c.birth_date IS NOT NULL AND c.birth_date = t.dt_nascimento) AS birth_equal,
         (c.birth_date IS NOT NULL AND t.dt_nascimento IS NOT NULL)  AS birth_known,
         c.norm_full_name, t.norm_nm_candidato
    FROM candidates c
    JOIN tse_staging t
      ON t.sg_uf = c.uf AND t.office = c.office     -- blocking (UF, cargo)
   WHERE c.candidacy_status IN ('PRE_ANUNCIADO','PRE_REIVINDICADO')
     AND c.tse_sq_candidato IS NULL
     AND NOT EXISTS (SELECT 1 FROM candidate_matches m
                      WHERE m.status='CONFIRMED'
                        AND (m.candidate_id=c.id OR m.sq_candidato=t.sq_candidato))
     AND greatest(
           similarity(c.norm_full_name, t.norm_nm_candidato),
           similarity(coalesce(c.norm_public_name,c.norm_full_name), t.norm_nm_urna)
         ) >= min_sim
$$;

-- ----------------------------------------------------------------------------
-- 5. UNICIDADE DE PRÉ-CANDIDATO (fase 1)
--    Sem isso, sugestões da comunidade duplicam a mesma pessoa. Homônimo civil
--    legítimo na MESMA disputa é raríssimo e passa por moderação (ajuste manual
--    do nome com sufixo distintivo até o TSE diferenciá-los por nascimento).
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_precandidato
  ON candidates (norm_full_name, office, coalesce(uf,'BR'))
  WHERE tse_sq_candidato IS NULL;
