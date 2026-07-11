# DitoFeito — Guia de Identidade

> "pode escrever"

## 1. Conceito: o registro

A marca vive no universo brasileiro do *ficar registrado*: o carimbo, o protocolo,
o papel timbrado, o roxo do papel-carbono. Solene o bastante para a imprensa citar,
quente o bastante para a tia do zap usar. O posicionamento visual ocupa o espaço
que ninguém tem: **institucional com calor** — nem o dark-mode neon dos sites de
aposta (distância obrigatória), nem o azul corporativo frio dos institutos.

Regra de ouro herdada da tese jurídica: **nada na interface pode lembrar cassino
ou corretora** — sem dark mode padrão, sem verde-dinheiro, sem odds piscando, sem
vocabulário de ganho financeiro.

## 2. Paleta

| Token | Hex | Papel |
|---|---|---|
| `--papel` | `#FAF8F3` | Fundo padrão (tema claro obrigatório) |
| `--papel-2` | `#F1EDE4` | Superfícies elevadas, cartões, fundo padrão de abas/chips |
| `--tinta` | `#1E2733` | Texto principal, títulos |
| `--grafite` | `#5C6672` | Texto secundário, legendas |
| `--violeta` | `#4F2E99` | **Primária.** Ações, links, marca, gráfico principal |
| `--violeta-2` | `#E8DFF7` | Bloco de cor sólido (headline binário, chips de preço, selos, hover) |
| `--conferido` | `#0F8F5F` | "Feito", acertos, altas. Vívido mas nunca neon — pill preenchido em variação de preço |
| `--carimbo` | `#C93A1F` | Quedas, alertas. Vívido mas nunca neon — pill preenchido em variação de preço |
| `--linha` | `#E3DDD0` | Bordas e divisores |

**Decisão 11/jul/2026:** tokens reajustados pra mais saturação/contraste (feedback:
"muito clean") — dentro do tema claro obrigatório, sem abrir mão da regra "sem
dark mode/neon". O ganho de "vivo" vem de **blocos de cor sólidos** (fundo
violeta-2 atrás do número-herói, chips preenchidos pra preço e variação), não de
mudar o tema ou usar verde/vermelho pra marcar SIM/NÃO — isso continua proibido
(seria exatamente o padrão de aposta que a marca evita). `--conferido`/`--carimbo`
seguem reservados pra variação de preço (alta/baixa) e resolução, nunca pra
"SIM bom, NÃO ruim".

**Por que violeta:** é a cor do papel-carbono e do mimeógrafo — a cor brasileira
do registro — e é a única faixa cromática sem dono na política nacional (vermelho
= PT; azul = direita; verde-amarelo = capturados). Neutralidade é requisito, não
estética.

**Outcomes em mercados MULTI:** paleta posicional fixa (definida no embed.ts),
nunca cor partidária.

## 3. Tipografia — família IBM Plex

| Papel | Fonte | Uso |
|---|---|---|
| Display | **IBM Plex Serif** 600/700 | Títulos de mercado, manchetes, wordmark |
| Interface | **IBM Plex Sans** 400/500/600 | Corpo, botões, navegação |
| Dados | **IBM Plex Mono** 500/600 | **Todos os números**: probabilidades, pontos, ledger, datas de resolução |

O mono nos números é decisão de posicionamento: tipografia de extrato bancário e
de terminal — o dado auditável. A probabilidade em Plex Mono grande é a "cara" do
produto.

Escala: 32/24/18 (display) · 15/14 (corpo) · 12 (legendas) · números de destaque
28–44 mono.

## 4. Assinatura: o carimbo

O único floreio da identidade. Aplicações:

- **Ao registrar previsão**: selo "DITO ✓ registrado" surge com leve rotação
  (-3°) e som de assentamento (escala 1.15→1.0, 250ms). Respeitar
  `prefers-reduced-motion`.
- **Mercado resolvido**: carimbo "FEITO" sobre o outcome vencedor.
- **Mercado anulado**: carimbo "ANULADO" em grafite.
- **Wordmark**: `Dito` em tinta + `Feito` em violeta, Plex Serif 700, com o
  check do carimbo integrado ao "F" ou como selo ao lado.

Todo o resto da interface fica quieto: bordas 8px, sombras mínimas, espaçamento
generoso. O carimbo só tem força porque é o único que se move.

## 5. Voz e vocabulário (contrato jurídico-verbal)

| Dizemos | Nunca dizemos |
|---|---|
| registrar previsão | apostar |
| posição | aposta |
| pontos | dinheiro, saldo em R$ |
| acertou / calibração | ganhou, lucro |
| o índice aponta | as odds pagam |
| resolvido / feito | pagou |

Microcopy de referência: botão **"Registrar previsão"**; confirmação **"Dito.
Agora é esperar o feito."**; seção de comentários **"Debate — só vale com
posição"**; vazio de mercado **"Ninguém disse nada ainda. Diga primeiro."**

Disclaimer obrigatório em todo mercado eleitoral (rodapé fixo):
*"Agregado de opiniões de participantes. Não é pesquisa eleitoral (Lei 9.504/97).
Aqui não existe dinheiro: pontos e reputação não têm valor monetário."*

## 6. Componentes-chave

- **Badge de posição no comentário**: `● SIM desde 42% · calibração 87%` — a
  posição do autor carimbada ao lado do nome, sempre.
- **Probabilidade**: número mono grande + seta de variação 24h
  (verde-conferido/vermelho-carimbo) + sparkline violeta.
- **Ranking**: medalha por *calibração*, não por pontos — o gráfico de calibração
  público é a credencial.
- **Selo de candidato verificado**: check violeta + "perfil reivindicado".

## 7. O que a identidade proíbe

Dark mode como padrão · verde-neon · contadores de "ganhos" · qualquer animação
de dinheiro/moedas · cores partidárias em outcomes · fotos de candidatos com
tratamento heroico ou pejorativo (mesmo enquadramento e tratamento para todos).
