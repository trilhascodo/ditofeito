-- Seeds mínimos de F0 (plano-construcao.md §3): usuário sistema + categoria
-- eleitoral. Sem eles, gerador.rodarGerador() lança "Seed ausente".
-- Idempotente (ON CONFLICT DO NOTHING) — seguro rodar mais de uma vez.

-- password_hash = '!' — nunca casa com argon2.verify(); usuário sistema não
-- faz login por senha, só existe como created_by/resolved_by de registros automáticos.
INSERT INTO users (handle, display_name, email, password_hash, role)
VALUES ('sistema', 'Sistema DitoFeito', 'sistema@ditofeito.com', '!', 'ADMIN')
ON CONFLICT (handle) DO NOTHING;

INSERT INTO categories (slug, name, vertical, brand_safe)
VALUES ('eleicoes-2026', 'Eleições 2026', 'POLITICA', false)
ON CONFLICT (slug) DO NOTHING;

-- Verticais não-políticas (decisão 10/jul/2026: mercados de esporte/cultura
-- pop como atrativo de engajamento, sem o limite de só política). brand_safe
-- = true aqui pro contrário de eleições — são exatamente as categorias
-- elegíveis pro patrocínio nativo (sponsors/sponsorships) quando existir.
INSERT INTO categories (slug, name, vertical, brand_safe) VALUES
  ('esportes', 'Esportes', 'ESPORTE', true),
  ('entretenimento', 'Entretenimento & Cultura Pop', 'ENTRETENIMENTO', true)
ON CONFLICT (slug) DO NOTHING;

-- "Menções": mercados de "expressão X foi dita em evento/discurso Y" —
-- mecânica, não tema (mistura Oscar, política, figura pública). vertical
-- OUTROS porque não é um assunto único; brand_safe=false porque a própria
-- categoria pode conter mercado político (ex.: presidente/pronunciamento)
-- mesmo quando o mercado individual não é (decisão 10/jul/2026).
INSERT INTO categories (slug, name, vertical, brand_safe)
VALUES ('mencoes', 'Menções', 'OUTROS', false)
ON CONFLICT (slug) DO NOTHING;

-- Moderadores reais: cadastrar manualmente via admin (não inventar contas aqui).

-- ----------------------------------------------------------------------------
-- Pré-candidatos MA 2026 — snapshot editorial 11/jul/2026 (imprensa: Imirante/
-- iPolítica 04/07, O Imparcial 24/05, Maranhão Brasil, Real Time Big Data
-- MA-04311/2026, blogs políticos regionais). Alimenta gerador.rodarGerador()
-- (binário "vai registrar"/"será eleito" por candidato + MULTI "quem vence"
-- por disputa majoritária). Vices/suplentes de chapa não entram — o schema
-- atual não modela "papel na chapa" separado do cargo disputado.
-- Idempotente via WHERE NOT EXISTS (uq_precandidato é índice parcial sobre
-- coluna gerada — ON CONFLICT exigiria repetir o predicado exato do índice).
-- ----------------------------------------------------------------------------
INSERT INTO candidates (name, ballot_name, party, office, uf, candidacy_status, source_url)
SELECT v.name, coalesce(v.ballot_name, v.name), v.party, v.office, 'MA', 'PRE_ANUNCIADO',
       'https://ditofeito.com/docs/pre-candidatos-ma-2026' -- snapshot editorial, não uma matéria só
FROM (VALUES
  -- Governador
  ('Orleans Brandão', 'Orleans Brandão', 'MDB', 'GOVERNADOR'),
  ('Eduardo Braide', 'Braide', 'PSD', 'GOVERNADOR'),
  ('Felipe Camarão', 'Felipe Camarão', 'PT', 'GOVERNADOR'),
  ('André Luís', 'André Luís', 'MISSÃO', 'GOVERNADOR'),
  ('Enilton Rodrigues', 'Enilton', 'PSOL', 'GOVERNADOR'),
  ('Saulo Arcangeli', 'Saulo Arcangeli', 'PSTU', 'GOVERNADOR'),
  -- Senado
  ('Weverton Rocha', 'Weverton', 'PDT', 'SENADOR'),
  ('Roseana Sarney', 'Roseana', 'MDB', 'SENADOR'),
  ('Eliziane Gama', 'Eliziane Gama', 'PT', 'SENADOR'),
  ('André Fufuca', 'Fufuca', 'PP', 'SENADOR'),
  ('Duarte Júnior', 'Duarte Jr.', 'AVANTE', 'SENADOR'),
  ('Pedro Lucas Fernandes', 'Pedro Lucas', 'UNIÃO', 'SENADOR'),
  ('Roberto Rocha', 'Roberto Rocha', 'NOVO', 'SENADOR'),
  ('Lahesio Bonfim', 'Dr. Lahesio', 'NOVO', 'SENADOR'),
  ('Antônia do Cariongo', 'Cariongo', 'PSOL', 'SENADOR'),
  ('Hilton Gonçalo', 'Hilton Gonçalo', 'MOBILIZA', 'SENADOR'),
  ('César Pires', 'César Pires', 'NOVO', 'SENADOR'),
  ('Simplício Araújo', 'Simplício', 'DC', 'SENADOR'),
  -- Deputado federal (destaque editorial)
  ('Rubens Júnior', NULL, 'PT', 'DEP_FEDERAL'),
  ('Bira do Pindaré', NULL, 'PT', 'DEP_FEDERAL'),
  ('Zé Carlos', NULL, 'PT', 'DEP_FEDERAL'),
  ('Dr. Yglésio', NULL, 'PRTB', 'DEP_FEDERAL'),
  ('Mical Damasceno', NULL, 'PSD', 'DEP_FEDERAL'),
  -- Deputado estadual (destaque editorial)
  ('Luanna Rezende', NULL, 'PT', 'DEP_ESTADUAL'),
  ('Cricielle Muniz', NULL, 'PT', 'DEP_ESTADUAL'),
  ('Zé Inácio', NULL, 'PT', 'DEP_ESTADUAL'),
  ('Paulo Romão', NULL, 'PT', 'DEP_ESTADUAL')
) AS v(name, ballot_name, party, office)
WHERE NOT EXISTS (
  SELECT 1 FROM candidates c
   WHERE c.norm_full_name = f_norm_name(v.name) AND c.office = v.office
     AND coalesce(c.uf, 'BR') = 'MA'
);

-- ----------------------------------------------------------------------------
-- Pré-candidatos a Governador — Sudeste + outros estados de destaque, 2026 —
-- snapshot editorial 20/jul/2026 (expansão de alcance além do MA, plano de
-- lançamento). Só Governador (é o dado que se tinha na curadoria); Wilson
-- Witzel (RJ) ficou de fora — partido "a definir" na fonte, sem dado
-- suficiente pra virar candidato ainda. Mesma mecânica idempotente da MA.
-- ----------------------------------------------------------------------------
INSERT INTO candidates (name, ballot_name, party, office, uf, candidacy_status, source_url)
SELECT v.name, v.name, v.party, 'GOVERNADOR', v.uf, 'PRE_ANUNCIADO',
       'https://ditofeito.com/docs/pre-candidatos-governador-2026'
FROM (VALUES
  -- São Paulo
  ('Tarcísio de Freitas', 'REPUBLICANOS', 'SP'),
  ('Fernando Haddad', 'PT', 'SP'),
  ('Carlos Machado', 'PCB', 'SP'),
  ('Izadora Dias', 'PCO', 'SP'),
  ('Kim Kataguiri', 'MISSÃO', 'SP'),
  ('Paulo Serra', 'PSDB', 'SP'),
  ('Vera Lúcia', 'PSTU', 'SP'),
  ('Vivian Mendes', 'UP', 'SP'),
  -- Rio de Janeiro
  ('Eduardo Paes', 'PSD', 'RJ'),
  ('André Marinho', 'NOVO', 'RJ'),
  ('André Português', 'REPUBLICANOS', 'RJ'),
  ('Anthony Garotinho', 'SEM PARTIDO', 'RJ'),
  ('Cyro Garcia', 'PSTU', 'RJ'),
  ('Douglas Ruas', 'PL', 'RJ'),
  ('Juliete Pantoja', 'UP', 'RJ'),
  ('Luan Monteiro', 'PCO', 'RJ'),
  ('Rafael Luz', 'MBL', 'RJ'),
  ('William Siri', 'PSOL', 'RJ'),
  -- Minas Gerais
  ('Mateus Simões', 'PSD', 'MG'),
  ('Alexandre Kalil', 'PDT', 'MG'),
  ('Ben Mendes', 'MISSÃO', 'MG'),
  ('Cleitinho', 'REPUBLICANOS', 'MG'),
  ('Flávio Roscoe', 'PL', 'MG'),
  ('Gabriel Azevedo', 'MDB', 'MG'),
  ('Jarbas Soares', 'PSB', 'MG'),
  ('Maria da Consolação', 'PSOL', 'MG'),
  ('Rafael Duda', 'PSTU', 'MG'),
  ('Rodrigo Pacheco', 'PSB', 'MG'),
  ('Túlio Lopes', 'PCB', 'MG'),
  -- Espírito Santo
  ('Lorenzo Pazolini', 'REPUBLICANOS', 'ES'),
  ('Magno Malta', 'PL', 'ES'),
  ('Paulo Hartung', 'PSD', 'ES'),
  ('Ricardo Ferraço', 'MDB', 'ES'),
  -- Ceará
  ('Elmano de Freitas', 'PT', 'CE'),
  ('Ciro Gomes', 'PSDB', 'CE'),
  ('Delegado Huggo Leonardo', 'MISSÃO', 'CE'),
  ('Eduardo Girão', 'NOVO', 'CE'),
  ('Giovanni Sampaio', 'PRD', 'CE'),
  ('Jarir Pereira', 'PSOL', 'CE'),
  ('Zé Batista', 'PSTU', 'CE'),
  -- Pernambuco
  ('Raquel Lyra', 'PSD', 'PE'),
  ('Camila Falcão', 'UP', 'PE'),
  ('Ivan Moraes', 'PSOL', 'PE'),
  ('João Campos', 'PSB', 'PE'),
  ('Renan Hallais', 'MISSÃO', 'PE'),
  -- Goiás
  ('Daniel Vilela', 'MDB', 'GO'),
  ('Adriana Accorsi', 'PT', 'GO'),
  ('Cíntia Dias', 'PSOL', 'GO'),
  ('Marconi Perillo', 'PSDB', 'GO'),
  ('Telêmaco Brandão', 'PN', 'GO'),
  ('Wilder Morais', 'PL', 'GO'),
  -- Paraná
  ('Rafael Greca', 'MDB', 'PR'),
  ('Luiz França', 'MISSÃO', 'PR'),
  ('Requião Filho', 'PDT', 'PR'),
  ('Samuel Mattos', 'PSTU', 'PR'),
  ('Sandro Alex', 'PSD', 'PR'),
  ('Sergio Moro', 'PL', 'PR'),
  ('Tony Garcia', 'DC', 'PR'),
  -- Rio Grande do Sul
  ('Evandro Augusto', 'MISSÃO', 'RS'),
  ('Gabriel Souza', 'MDB', 'RS'),
  ('Juliana Brizola', 'PDT', 'RS'),
  ('Luciano Zucco', 'PL', 'RS'),
  ('Marcelo Maranata', 'PSDB', 'RS'),
  ('Priscila Voigt', 'UP', 'RS'),
  ('Rejane Oliveira', 'PSTU', 'RS')
) AS v(name, party, uf)
WHERE NOT EXISTS (
  SELECT 1 FROM candidates c
   WHERE c.norm_full_name = f_norm_name(v.name) AND c.office = 'GOVERNADOR'
     AND coalesce(c.uf, 'BR') = v.uf
);
