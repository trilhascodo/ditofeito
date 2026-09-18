-- Análise de funil de conversão (visita -> engajamento -> cadastro). SÓ LEITURA.
-- Uso na VPS, a partir da raiz do repo:
--   infra/scripts/funil.sh            (ou 'funil.sh 30' pra janela de 30 dias)
--
-- Limites do dado (page_views, 006): visitor_hash = sha256(salt do dia + ip +
-- UA) com salt em memória que troca a cada dia E a cada deploy/restart —
-- então "visitante" aqui é "visitante-dia" e não dá pra seguir a mesma pessoa
-- entre dias nem ligar uma visita a um cadastro específico. Visitante-dia que
-- abriu qualquer /admin é tratado como equipe e excluído.

-- Transação só pra descartar as views temporárias no ROLLBACK final (READ
-- ONLY não deixaria criar nem as temporárias); nada aqui escreve em tabela.
BEGIN;

CREATE TEMP VIEW pv AS
  SELECT p.*, date_trunc('day', p.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia
    FROM page_views p
   WHERE p.created_at > now() - (:'dias' || ' days')::interval
     AND NOT EXISTS (SELECT 1 FROM page_views a
                      WHERE a.visitor_hash = p.visitor_hash AND a.path LIKE '/admin%');

CREATE TEMP VIEW vd AS  -- uma linha por visitante-dia
  SELECT visitor_hash, dia, count(*) AS views,
         (array_agg(path ORDER BY created_at))[1] AS entrada,
         (array_agg(referrer_host ORDER BY created_at) FILTER (WHERE referrer_host IS NOT NULL))[1] AS origem,
         bool_or(path LIKE '/m/%') AS viu_mercado,
         bool_or(path LIKE '/grupos%' OR path LIKE '/enquete%') AS viu_grupo,
         bool_or(path IN ('/cadastro','/entrar')) AS viu_cadastro_login,
         bool_or(path = '/cadastro') AS viu_cadastro
    FROM pv GROUP BY visitor_hash, dia;

\echo '== 1. TOTAIS (sem equipe) =='
SELECT count(*) AS visitantes_dia, sum(views) AS pageviews,
       round(avg(views), 2) AS paginas_por_visita,
       round(100.0 * count(*) FILTER (WHERE views = 1) / nullif(count(*),0), 1) AS pct_so_1_pagina
  FROM vd;

\echo '== 2. FUNIL (visitantes-dia) =='
SELECT count(*) AS "1_chegou",
       count(*) FILTER (WHERE views > 1) AS "2_navegou_2+_paginas",
       count(*) FILTER (WHERE viu_mercado OR viu_grupo) AS "3_abriu_mercado_ou_bolao",
       count(*) FILTER (WHERE viu_cadastro_login) AS "4_abriu_cadastro_ou_login",
       count(*) FILTER (WHERE viu_cadastro) AS "4b_abriu_cadastro",
       (SELECT count(*) FROM users WHERE role IN ('USER','SPONSOR')
           AND created_at > now() - (:'dias' || ' days')::interval) AS "5_contas_criadas",
       (SELECT count(*) FROM users WHERE role IN ('USER','SPONSOR') AND email_verified_at IS NOT NULL
           AND created_at > now() - (:'dias' || ' days')::interval) AS "6_email_confirmado"
  FROM vd;

\echo '== 3. POR DIA =='
SELECT d.dia, count(vd.*) AS visitantes, count(*) FILTER (WHERE vd.viu_mercado) AS viu_mercado,
       count(*) FILTER (WHERE vd.viu_cadastro) AS viu_cadastro,
       (SELECT count(*) FROM users u WHERE role IN ('USER','SPONSOR')
          AND (u.created_at AT TIME ZONE 'America/Sao_Paulo')::date = d.dia) AS contas
  FROM (SELECT DISTINCT dia FROM vd) d LEFT JOIN vd USING (dia)
 GROUP BY d.dia ORDER BY d.dia;

\echo '== 4. DE ONDE VEM (origem externa da 1a pagina) =='
SELECT coalesce(origem, '(direto / sem referrer)') AS origem, count(*) AS visitantes,
       round(avg(views), 1) AS paginas_media,
       count(*) FILTER (WHERE viu_cadastro) AS chegou_no_cadastro
  FROM vd GROUP BY 1 ORDER BY visitantes DESC LIMIT 15;

\echo '== 5. PAGINA DE ENTRADA =='
SELECT regexp_replace(entrada, '^/(m|grupos|indice|convite)/.*', '/\1/*') AS entrada,
       count(*) AS visitantes,
       round(100.0 * count(*) FILTER (WHERE views = 1) / count(*), 0) AS pct_saiu_na_hora,
       count(*) FILTER (WHERE viu_cadastro) AS chegou_no_cadastro
  FROM vd GROUP BY 1 ORDER BY visitantes DESC LIMIT 15;

\echo '== 6. O QUE A PESSOA VIU ANTES DE ABRIR /cadastro =='
SELECT anterior, count(*) FROM (
  SELECT lag(path) OVER (PARTITION BY visitor_hash, dia ORDER BY created_at) AS anterior, path FROM pv
) t WHERE path = '/cadastro' GROUP BY anterior ORDER BY count DESC LIMIT 10;

\echo '== 7. PAGINAS MAIS VISTAS =='
SELECT regexp_replace(path, '^/(m|grupos|indice|convite)/.*', '/\1/*') AS pagina,
       count(*) AS views, count(DISTINCT visitor_hash || dia) AS visitantes
  FROM pv GROUP BY 1 ORDER BY views DESC LIMIT 15;

\echo '== 8. CONTAS (todas) =='
SELECT u.created_at::date AS criada, u.role, u.email_verified_at IS NOT NULL AS email_ok,
       EXISTS (SELECT 1 FROM oauth_identities o WHERE o.user_id = u.id) AS google,
       (SELECT max(s.created_at)::date FROM sessions s WHERE s.user_id = u.id) AS ultima_sessao
  FROM users u ORDER BY u.created_at;

ROLLBACK;
