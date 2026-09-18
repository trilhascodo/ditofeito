-- Reset total de mercados, bolões, pontos e patrocínios (2026-09-18).
-- Decisão do dono: audiência baixa e sem conversão até aqui — recomeçar do
-- zero antes de decidir os próximos mercados. NÃO é uma migration: roda uma
-- vez, à mão, via reset-mercados.sh (que faz pg_dump antes e escolhe
-- COMMIT/ROLLBACK).
--
-- O que MANTÉM: users (contas, login, sessões), candidates + base TSE,
-- sponsors (contas de patrocinador), categories, home_links, leads
-- (market_requests, sponsor_leads, sponsor_applications), e os registros de
-- pagamento em dinheiro real (user_payments, sponsor_payments) — histórico
-- financeiro/contábil, não se apaga mesmo zerando os saldos.
--
-- TRUNCATE sem CASCADE de propósito: se alguma tabela que referencia essas
-- ficou de fora da lista, o Postgres recusa e nada é apagado (em vez de o
-- CASCADE levar junto algo que não devia).

\echo '== ANTES =='
SELECT 'markets' AS tabela, count(*) FROM markets
UNION ALL SELECT 'trades', count(*) FROM trades
UNION ALL SELECT 'positions', count(*) FROM positions
UNION ALL SELECT 'comments', count(*) FROM comments
UNION ALL SELECT 'groups (bolões/enquetes)', count(*) FROM groups
UNION ALL SELECT 'boloes', count(*) FROM boloes
UNION ALL SELECT 'bolao_palpites', count(*) FROM bolao_palpites
UNION ALL SELECT 'sponsorships', count(*) FROM sponsorships
UNION ALL SELECT 'point_ledger', count(*) FROM point_ledger
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'sponsors com saldo', count(*) FROM sponsors WHERE balance_cents > 0;

BEGIN;

TRUNCATE
  -- mercados
  markets, market_outcomes, market_groups, trades, positions, resolutions,
  price_snapshots, comments, comment_reports, market_news, market_share_events,
  vindication_cards, reputation_events, user_reputation,
  index_series, index_points,
  -- bolões / enquetes
  groups, group_members, group_posts, boloes, bolao_palpites,
  bolao_custom_outcomes, bolao_vindication_cards,
  -- patrocínios
  sponsorships, ad_events, sponsor_ledger,
  -- notificações (apontam pra mercado/bolão/grupo/comentário)
  notifications,
  -- pontos
  point_ledger
RESTART IDENTITY;

UPDATE sponsors SET balance_cents = 0;

-- Recomeço com o saldo inicial de cadastro (AUTH_CONFIG.signupBonusPoints =
-- 1000) pra todo usuário existente — ledger vazio = saldo 0 e ninguém
-- conseguiria prever nos mercados novos. Hash no mesmo formato de
-- trade.ts::entryHash, calculado a partir de created_at::text depois do
-- INSERT (é exatamente o que verifyLedgerChain relê).
INSERT INTO point_ledger
  (user_id, delta, balance_after, reason, ref_type, ref_id, prev_hash, entry_hash, created_at)
SELECT id, 1000, 1000, 'SIGNUP_BONUS', NULL, NULL, 'GENESIS', '', clock_timestamp()
  FROM users;

UPDATE point_ledger SET entry_hash = encode(sha256(convert_to(
  'GENESIS|' || user_id::text || '|' || to_char(delta, 'FM9999999999990.0000')
  || '|SIGNUP_BONUS|' || created_at::text, 'UTF8')), 'hex');

\echo '== DEPOIS (dentro da transação) =='
SELECT 'markets' AS tabela, count(*) FROM markets
UNION ALL SELECT 'groups', count(*) FROM groups
UNION ALL SELECT 'sponsorships', count(*) FROM sponsorships
UNION ALL SELECT 'point_ledger', count(*) FROM point_ledger
UNION ALL SELECT 'candidates (mantidos)', count(*) FROM candidates
UNION ALL SELECT 'user_payments (mantidos)', count(*) FROM user_payments
UNION ALL SELECT 'sponsor_payments (mantidos)', count(*) FROM sponsor_payments;

-- Amostra pra conferir o hash contra trade.ts::entryHash fora do banco.
SELECT user_id, delta, created_at::text AS ts, entry_hash FROM point_ledger LIMIT 1;

-- COMMIT ou ROLLBACK é anexado por reset-mercados.sh.
