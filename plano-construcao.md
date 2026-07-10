# DitoFeito — Plano de Construção

> Documento de engenharia e execução. Companheiro do README técnico (arquitetura)
> e do guia de identidade (design). Data-base: 10/jul/2026.

## 0. Premissas (corrigir se erradas — o plano deriva delas)

1. **Executor:** Dimi, solo, em paralelo a outras responsabilidades → capacidade
   estimada de 15–20h/semana. Sem equipe contratada na fase inicial.
2. **Infra:** VPS própria (já operada em outros projetos) + Cloudflare gratuito
   na frente. Sem cloud gerenciada cara.
3. **Orçamento:** custo mensal alvo < R$ 200 (VPS + domínios + e-mail transacional).
   INPI e eventuais SMS são os únicos custos extras relevantes.
4. **Estratégia de lançamento:** soft launch Maranhão na janela das convenções,
   crescer por UF conforme tração. Perfeição nacional NÃO é meta do MVP.

## 1. Estrutura do repositório (monorepo pnpm)

```
ditofeito/
├── apps/
│   ├── api/           # Node 22 + tRPC v11 + rotas HTTP públicas (embed/card/json)
│   │   ├── src/routers/   (market, trade, candidate, comment, admin)
│   │   ├── src/http/      (embed.ts já pronto — rotas cacheáveis fora do tRPC)
│   │   └── src/jobs/      (gerador diário, matcher, verifyLedger, snapshots)
│   └── web/           # Vite + React 18 + TanStack Query + tRPC client
│       └── src/            (tokens da identidade → CSS vars; protótipo é o gabarito)
├── packages/
│   ├── core/          # lmsr.ts, tipos de domínio, schemas Zod compartilhados
│   └── db/            # migrações SQL numeradas + camada de queries (node-postgres)
├── infra/
│   ├── docker-compose.yml  (postgres16, api, caddy)
│   ├── Caddyfile           (TLS automático, headers de cache do embed)
│   └── scripts/            (backup.sh, deploy.sh, restore-test.sh)
└── .github/workflows/ci.yml
```

Racional: os módulos já validados (lmsr, trade, matcher, gerador, embed) entram
em `packages/core` e `apps/api` praticamente como estão — a validação contra
Postgres real já foi feita nesta fase de design.

## 2. Decisões técnicas fechadas

| Tema | Decisão | Racional |
|---|---|---|
| Auth | E-mail+senha (argon2) + verificação de e-mail; sessão em cookie httpOnly. Telefone/SMS **adiado** para quando houver sinal de manipulação | SMS custa e atrasa MVP; as defesas LIMITE_EXPOSICAO + índice ponderado por reputação já mitigam o risco inicial |
| Frontend | Vite + React + TanStack Query; CSS vars dos tokens (sem Tailwind — a identidade é específica demais p/ utility-first render igual) | Protótipo vira componentes 1:1 |
| Gráficos | SVG próprio (como no protótipo) — sem lib de chart | O sparkline/linha é simples; lib pesa e padroniza a cara |
| Jobs | `node-cron` dentro do processo da API | Um processo a menos p/ operar; volume não justifica fila |
| Deploy | Docker Compose na VPS + Caddy (TLS) + Cloudflare (CDN/cache do embed, proteção DDoS básica) | Stack que você já opera; embed cacheado na borda é requisito de produto |
| Backup | `pg_dump` noturno → object storage barato (B2/R2) + **teste de restore mensal agendado** | Ledger sem backup testado não é ledger |
| CI | GitHub Actions: typecheck + vitest (os invariantes do README viram testes) + build | Os testes de invariante já existem como scripts .mjs — portar p/ vitest |
| Monitoramento | Uptime Kuma + logs estruturados (pino) + alerta Telegram | Suficiente p/ um operador solo |
| E-mail | Resend/SES nível gratuito | Só transacional no MVP |

**Segurança mínima inominável:** secrets fora do repo (.env na VPS, nunca em chat
— lição CarToken), rate limit por IP nas rotas públicas, CORS restrito no tRPC,
`frame-ancestors *` SOMENTE nas rotas de embed.

## 3. Fases contra o calendário

### F0 — Fundação (semana de 13/jul) · ~15h
Monorepo montado; migrações 001+002 aplicadas; auth básico; deploy pipeline
funcionando (commit → VPS); seeds (categoria, usuário sistema, admin).
**Critério de saída:** criar mercado via admin e dar trade via API em produção.

### F1 — MVP navegável (14–27/jul) · ~35h  ⚠️ janela das convenções
- Páginas: home (lista de mercados por categoria), mercado (portar protótipo),
  perfil próprio (posições + extrato do ledger), login/cadastro.
- Fluxos: trade completo; sugestão de pré-candidato (form + fila de moderação);
  painel admin mínimo (criar/editar/resolver/anular mercado com justificativa).
- Conteúdo de estreia: mercados de convenção ("quem sai candidato ao governo
  pelo partido X?") — curadoria manual MA, resolução em semanas (treina o loop).
- Embed + card OG no ar (código pronto; falta rota + conversão SVG→PNG).
**Critério de saída:** 20 mercados MA no ar, 30 usuários reais, primeiro embed
em site de terceiro. **Corte consciente:** sem comentários ainda (F2), sem
ranking público (F2), visual "bom o bastante", não pixel-perfect.

### F2 — Loop social e reputação (28/jul–17/ago) · ~40h
- Comentários com badge de posição (o diferencial social).
- Ranking de calibração + página de reputação pública por usuário.
- Reivindicação de perfil de candidato (form com campos-TSE).
- **15/ago: importador TSE + matcher em produção** — fila de revisão de matches
  no admin; resolução automática dos mercados "registro-*"; geração programática
  dos mercados de eleitos (gerador.ts).
**Critério de saída:** base reconciliada com o TSE; mercados de todas as
disputas majoritárias MA + binários dos registrados.

### F3 — Índice citável e endurecimento (18/ago–30/set) · ~35h
- Índice DitoFeito: séries por disputa, página pública com metodologia
  versionada, ponderação por skill_score.
- API pública B2B (api_clients) + página /imprensa (kit + manchetes de exemplo).
- Anti-manipulação fase 2: MANADA_COORDENADA, dashboards de flags, limites
  revisados com dados reais.
- Carga: teste dos embeds sob cache; particionamento de price_snapshots se doer.
- Outreach: 3 jornalistas de política MA recebem acesso ao kit (o teste de
  citabilidade vira estratégia de lançamento do índice).

### F4 — Eleição e além (out→)
Outubro é OPERAÇÃO, não desenvolvimento: freeze de features na semana do 1º
turno; plantão de resolução na noite da apuração (o momento de maior tráfego e
maior risco reputacional — resolver rápido e certo é o produto). Pós-eleição:
verticais reality/esporte (retenção entre ciclos), dashboard B2B p/ campanhas
(2º turno municipal 2028 é o próximo ciclo), mobile PWA.

## 4. Operação (o custo invisível — orçar tempo como feature)

Rotina diária do operador (30–45 min): fila de sugestões de pré-candidato;
fila de matches (a partir de ago); flags anti-manipulação; resoluções vencidas
(`resolve_by` estourando = alerta). **Regra de ouro operacional:** resolução
sempre com justificativa + fonte no mesmo dia do fato — a credibilidade do
índice é a soma das resoluções bem feitas.

Runbook mínimo a escrever na F1: como resolver, como anular, como banir, como
responder "onde saco meu dinheiro" (resposta padrão pronta), o kit
anti-associação (página /nao-somos-aposta + parágrafo p/ imprensa).

## 5. Riscos de execução e mitigações

| Risco | Mitigação |
|---|---|
| Capacidade solo < plano (vida acontece) | Cortes pré-decididos por fase (listados acima); F1 é o único prazo rígido — o resto desliza sem quebrar a tese |
| Convenções chegarem antes do MVP | Plano B: lançar só com mercados de convenção + trade, sem perfil público (3 telas) — pior MVP no ar vence melhor MVP no localhost |
| Pico de tráfego (viralização de embed) | Cloudflare na frente + cache s-maxage já projetado; Postgres só vê 1 hit/min/mercado |
| Judicialização/notificação | Dossiê de conformidade (2 páginas, tese tripla já redigida no README) pronto ANTES; advogado sob demanda |
| Burnout do operador único | Moderação comunitária estruturada na F4; até lá, escopo geográfico contido (MA) é a proteção |

## 6. Definition of done do projeto-MVP

A plataforma está "construída" quando: (1) um pré-candidato real do MA
compartilhou o próprio embed; (2) um mercado de convenção foi resolvido com
justificativa pública e pagou reputação; (3) o extrato de um usuário passa no
verifyLedgerChain exposto publicamente; (4) o disclaimer eleitoral aparece em
100% das superfícies (site, embed, card); (5) backup restaurado com sucesso em
teste. Cinco fatos verificáveis — no espírito da casa.
