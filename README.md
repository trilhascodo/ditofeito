# DitoFeito — Plataforma de Predição Reputacional

**ditofeito.com.br** · "pode escrever"

Backend de uma plataforma brasileira de mercados de predição **baseada em reputação,
sem dinheiro real** — pontos fictícios, ranking por calibração, debate ancorado em
posições. Vertical de lançamento: eleições 2026, com pré-candidaturas como motor de
aquisição. Verticais de sustentação entre ciclos: realities e esporte.

Stack: **TypeScript · PostgreSQL 16 · tRPC v11 · Zod · node-postgres (pg)**
Todos os módulos foram validados contra um PostgreSQL 16 real, incluindo teste de
concorrência (20 trades simultâneos) e simulação de 25 dias de tráfego.

---

## 1. Tese de produto (resumo das decisões)

| Decisão | Escolha | Motivo |
|---|---|---|
| Mecânica | **Mercado (LMSR)**, não agregação de palpites | Movimento de preço é evento social; o gráfico vira a espinha do debate |
| Moeda × Reputação | **Separadas** | Pontos são gastáveis/inflacionáveis; reputação (Brier/skill) é o sinal epistêmico e pondera o índice |
| Resolução | **Centralizada, transparente, auditável** | Critério verificável + fonte nomeada obrigatórios na criação; justificativa pública na resolução; estado ANULADO previsto |
| Debate | Comentário **carrega a posição** do autor | Skin in the game reputacional visível; mata o comentário de arquibancada |
| Eleições | Fase 1 (pré-candidatura, base própria) → Fase 2 (reconciliação TSE) | O TSE só existe após o registro (~15/ago); a janela de pré-campanha é o pico de demanda por sinal |
| Majoritário × Proporcional | MULTI "quem vence?" só p/ PRESIDENTE/GOVERNADOR/SENADOR/PREFEITO; proporcional só tem binário individual | Eleição proporcional não tem "vencedor da disputa" |
| Receita | Índice citável B2B + inteligência p/ campanhas + mercados patrocinados; **display político descartado**; **anúncio de bets recusado por princípio** | Brand safety mata CPM político; bet contamina a tese "não somos aposta" |
| Candidatos | **Nunca compram posição no índice** | O único ativo é a credibilidade do sinal; candidato é canal de distribuição (embed) e cliente de leitura (dashboard), jamais de distorção |

### Linha jurídica (existencial — não relaxar)
1. **Não é aposta** (Res. CMN abr/2026 + Lei 14.790): nenhuma conversibilidade de
   pontos em dinheiro/prêmio, em nenhuma direção. Sem gateway de pagamento na
   arquitetura. Vocabulário de interface: "prever/posição/pontos", nunca "apostar/ganhar".
2. **Não é pesquisa eleitoral** (Lei 9.504/97): disclaimer obrigatório em todo
   mercado `is_electoral`, embutido no próprio embed e no card OG (viaja com o artefato).
3. **Não é propaganda paga irregular** (art. 57-C): sem venda de destaque a
   pré-candidato; impulsionamento formal só em fase futura, segregado do índice.

---

## 2. Arquivos e responsabilidades

```
packages/db/migrations/001_schema.sql   Migração 001 — núcleo (22 tabelas)
packages/db/migrations/002_tse.sql      Migração 002 — pré-candidatura, staging TSE, matches
packages/db/seeds/001_seed.sql          Usuário sistema + categoria eleicoes-2026
packages/core/src/lmsr.ts               Matemática pura: LMSR + Brier/skill (sem dependências)
apps/api/src/domain/trade.ts            Transação de trade, resolução, anulação, auditoria do ledger
apps/api/src/jobs/matcher.ts            Reconciliação fase 1 × registro TSE (tiers auditáveis)
apps/api/src/jobs/gerador.ts            Fábrica programática de mercados eleitorais (job diário)
apps/api/src/http/embed.ts              Widget embedável + JSON público + card OG (distribuição)
```

Estrutura completa do monorepo em `plano-construcao.md` §1.

### Domínios do schema (001)
- **Identidade/valor**: `users`, `point_ledger` (hash-encadeado, saldo derivável),
  `user_reputation` + `reputation_events` (Brier vs. baseline do mercado)
- **Mercados**: `categories` (com `brand_safe`), `market_groups`, `markets`
  (critério/fonte/prazos obrigatórios; `is_electoral` força disclaimer),
  `market_outcomes` (vetor `q` do LMSR; `is_catchall` p/ OUTROS)
- **Negociação**: `trades`, `positions` (cache; verdade deriva de trades),
  `price_snapshots` (todos os outcomes a cada trade — alimenta sparkline e índice)
- **Governança**: `resolutions` (RESOLVED|VOIDED, justificativa + fonte públicas)
- **Social**: `comments` (com `position_snapshot` e reputação do autor no momento)
- **Receita**: `sponsors`/`sponsorships`, `index_series`/`index_points`
  (metodologia em jsonb = transparência citável), `api_clients` (B2B)
- **Eleitoral**: `candidates` (ciclo PRE_ANUNCIADO → PRE_REIVINDICADO → REGISTRADO
  → … → NAO_REGISTROU), `candidate_aliases`

### Migração 002 (eleitoral)
- `f_norm_name()` IMMUTABLE + colunas `GENERATED` (normalização escrita uma vez)
- `tse_staging` (espelho bruto do consulta_cand; upsert por SQ_CANDIDATO — reimportável)
- `candidate_matches` (proposta→confirmação; **índices únicos parciais garantem 1:1
  no nível do banco**)
- `f_match_pairs()` (blocking UF×cargo + trigram no Postgres; app só vê pares plausíveis)
- `uq_precandidato` (nome civil normalizado + cargo + UF, parcial onde sem TSE) —
  impede duplicação de pré-candidato por sugestão da comunidade

---

## 3. Invariantes validados (o que os testes provaram)

| Invariante | Evidência |
|---|---|
| Σ preços = 1 após qualquer sequência de trades | 1.00000000 pós 20 trades concorrentes |
| Ledger ≡ função de custo: Σ débitos = C(q)−C(0) | 400.0000 = 400.0000 (4 casas, sob concorrência) |
| Cadeia de hash íntegra por usuário | `verifyLedgerChain` = true p/ todos após o teste |
| Perda máx. do AMM ≤ b·ln(N) | Subsídio observado dentro do teórico (48.28) |
| Sem deadlock | Ordem fixa de locks: **mercado → usuário**, sempre |
| Venda a descoberto / saldo negativo impossíveis | Exceções SHARES_INSUFICIENTES / SALDO_INSUFICIENTE |
| Gerador idempotente | 2ª execução cria 0; novo pré-candidato → 2 binários + sync no MULTI |
| Matcher conservador | Homônimo c/ nascimento divergente → descartado (0,645); dados incompletos → fila humana, nunca auto-match |

### Concorrência (trade.ts)
Lock pessimista (`FOR UPDATE`) em vez de SERIALIZABLE+retry: enfileira trades do
mesmo mercado (comportamento desejado — cada trade vê o preço que o anterior deixou)
e paraleliza mercados distintos. Timestamp do hash vem de `clock_timestamp()` do
banco (nunca do Node) para a verificação da cadeia bater.

### Parâmetros a calibrar em produção
- `liquidity_b`: `suggestB(N, depth)` = depth·ln(N). Binários depth 40; majoritárias
  visíveis **150–300** (teste mostrou que depth 40 deixa 1 usuário mover 18%→99% com
  ~800 pontos).
- Matcher: pesos 0,6/0,15/0,25 e limiares 0,92/0,70 são chute educado — recalibrar
  contra as decisões humanas da primeira fila de revisão (ground truth de graça).
- Anti-manipulação: `LIMITE_EXPOSICAO` (bloqueia; 1000 pts/mercado inicial) e
  `POSICAO_DOMINANTE` (>50% das shares de um outcome → flag, não bloqueio).
  Prevista regra `MANADA_COORDENADA` (N contas novas, mesmo outcome, mesma janela).
- **Índice ponderado por reputação** (`skill_score` como peso na `index_series`):
  conta nova move o preço do mercado, quase não move o índice citável — manipular
  exige meses de acerto real, que é o comportamento desejado de qualquer forma.

---

## 4. Fluxo eleitoral 2026 (calendário embutido no gerador)

```
AGORA ──────────── ~20/jul–5/ago ──── ~15/ago ─────── 4/out ──── 25/out ── diplomação
fase 1: base própria   convenções    prazo registro   1º turno   2º turno   resolução
curadoria + sugestão   mercados de   IMPORT TSE +     fecha      fecha      "eleito?"
+ reivindicação        convenção     MATCHER roda     "eleito?"  MULTI      paga
mercados "registro-*"                "registro-*"
                                     resolvem SIM/NÃO
```

- Slugs são contrato: `registro-*` (o matcher fecha esses mercados no match) e
  `eleito-*`. Não renomear sem ajustar `applyMatchEffects`.
- Import TSE: consulta_cand em Latin-1, `;`, mesmo padrão de parsing do pipeline
  Educacenso já existente. Filtrar suplentes de senador (vêm como registros próprios).
- Reivindicação de perfil = formulário que pede exatamente os campos do TSE (nome
  civil, nascimento, partido, cargo, UF) → match quase determinístico na fase 2.
- Novo outcome em MULTI já negociado entra com `q = min(q)` dos existentes (nasce
  com o preço do mais barato, roubando probabilidade de OUTROS, onde estava implícito).

---

## 5. Distribuição (embed.ts)

- `GET /embed/:slug` — HTML autocontido (~4 KB, zero deps), disclaimer eleitoral
  embutido, link de volta com UTM. Snippet de iframe exibido na página do mercado.
- `GET /api/pub/:slug.json` — dados públicos (embrião da API B2B do índice).
- `GET /card/:slug.svg` — card 1200×630 p/ og:image. **Pendência: converter p/ PNG
  no deploy (resvg-js/sharp) — WhatsApp não pré-visualiza SVG.**
- Cache `s-maxage=60, stale-while-revalidate=300` — CDN absorve viralização;
  `frame-ancestors *` **somente** nesses endpoints.
- Cores dos outcomes: paleta fixa por posição, nunca cor partidária (neutralidade).

---

## 6. Ordem de deploy / o que falta

1. `pnpm --filter @ditofeito/db migrate` (aplica 001→002 em ordem; Postgres 16;
   extensões pgcrypto, unaccent, pg_trgm) → `pnpm --filter @ditofeito/db seed`
2. ~~Seeds: usuário `sistema`, categoria `eleicoes-2026`~~ — feito
   (`packages/db/seeds/001_seed.sql`); moderadores reais ainda a cadastrar via admin
3. Envelope tRPC (mecânico): procedures finas sobre `executeTrade`/`resolveMarket`/
   `voidMarket` mapeando `TradeError.code` → `TRPCError`; rotas públicas do embed
   já fora do tRPC (`apps/api/src/http/embed.ts`, montadas em `apps/api/src/index.ts`)
4. Jobs: `rodarGerador()` diário e auditoria noturna do ledger já agendados
   (`apps/api/src/jobs/schedule.ts`, node-cron in-process); `runMatcher()` fica
   sob demanda (chamado pelo admin a cada republicação do TSE, não por cron);
   agregação de `price_snapshots` (compactar intra-minuto quando o volume doer —
   dívida consciente) ainda por fazer
5. Import TSE (adaptar pipeline Educacenso) + `markNonRegistered` + `createUnmatchedFromTse`
   agendados p/ pós-prazo de registro
6. **Frontend** (maior bloco restante): scaffold Vite+React em `apps/web` no ar
   (F0); páginas de mercado, ranking de calibração, comentários com posição,
   fluxo de sugestão/reivindicação de pré-candidato, fila de revisão do
   moderador ficam para F1 (`plano-construcao.md` §3).

### Cold start (plano)
Maranhão primeiro (custo de curadoria baixo, terreno conhecido) → mercados de
convenção (resolvem em semanas, treinam o loop de reputação) → diretório de
pré-candidaturas como conteúdo indexável → embed/card como canal viral →
expansão por UF conforme a comunidade assume as sugestões.

---

## 7. Marca (decidida em 09/07/2026)

- **Plataforma:** DitoFeito — o *dito* é a posição registrada no ledger; o *feito* é a resolução.
- **Produto citável:** Índice DitoFeito (metodologia pública versionada — é o que a imprensa cita).
- **Slogan:** "pode escrever".
- **Domínios a registrar:** ditofeito.com.br, ditoefeito.com.br (erro de grafia mais provável — defensivo), indiceditofeito.com.br, ditofeito.app. Evitar .io (TLD do lote bloqueado).
- **INPI:** depósito nas classes 35, 38, 41 e 42, em nome do CNPJ, o quanto antes (a prioridade conta do depósito).
- **Handles:** Instagram, X, TikTok, YouTube e WhatsApp Business no mesmo dia do registro.
- Critérios que o nome atravessou (registro histórico da decisão): compreensão imediata pelo
  público geral; adaptável além do ciclo eleitoral (não pressupõe disputa); popular sem ser
  vulgar (expressão consagrada — citável por editor); sem parentesco fonético com plataformas
  bloqueadas pela Anatel; sem moldura de "opinião/pesquisa" (Lei 9.504); domínio viável;
  semântica alinhada à mecânica (dito=posição, feito=resolução).
