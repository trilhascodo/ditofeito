// CLI: pacote de mercados de longo prazo fora da política (2026-10-23).
//
// Funil de 23/10: desde o 1º turno quase ninguém abre mercado, e a home só
// tinha política. Jogo do gerador de esporte vive <48h (a API só vê hoje e
// amanhã); estes ficam abertos semanas, tempo pra juntar previsão e
// compartilhamento. Fatos conferidos em 23/10 (fontes em cada mercado).
//
// Nasce em RASCUNHO pra revisão no Admin → Mercados; --publicar nasce aberto.
// Simulação por padrão (ROLLBACK); --aplicar grava. Idempotente por slug.
//
// Uso (na VPS): docker compose -f infra/docker-compose.yml exec -T api node apps/api/dist/jobs/run-pacote-mercados.js [--aplicar] [--publicar]
import { getPool } from "@ditofeito/db";
import { suggestB } from "@ditofeito/core";
import { createMarketIdempotent, type MarketOutcomeInput } from "../domain/marketFactory.js";

const aplicar = process.argv.includes("--aplicar");
const publicar = process.argv.includes("--publicar");

interface Pacote {
  slug: string; categoria: "esportes" | "economia"; title: string; description: string;
  outcomes: MarketOutcomeInput[]; criterio: string; fonte: string;
  closeAt: string; resolveBy: string;
}

const SIM_NAO: MarketOutcomeInput[] = [{ label: "SIM" }, { label: "NÃO" }];

const PACOTE: Pacote[] = [
  // ------------------------------ Esportes ---------------------------------
  {
    slug: "campeao-brasileirao-2026", categoria: "esportes",
    title: "Quem será o campeão do Brasileirão 2026?",
    description: "Após a 31ª rodada, o Flamengo lidera com 67 pontos, um à frente do Palmeiras (66). O Athletico-PR, 3º, tem 53.",
    outcomes: [{ label: "Flamengo" }, { label: "Palmeiras" }, { label: "Outro clube", isCatchall: true }],
    criterio: "Resolve no clube declarado campeão da Série A do Campeonato Brasileiro de 2026 pela CBF. " +
      "\"Outro clube\" vence se o campeão não for Flamengo nem Palmeiras.",
    fonte: "CBF — classificação oficial da Série A 2026",
    closeAt: "2026-12-02T16:00:00-03:00", resolveBy: "2026-12-15T23:59:59-03:00",
  },
  {
    slug: "gremio-rebaixado-brasileirao-2026", categoria: "esportes",
    title: "O Grêmio será rebaixado no Brasileirão 2026?",
    description: "Após a 31ª rodada, o Grêmio tem 31 pontos e está na zona de rebaixamento, com Remo (26) e Chapecoense (18).",
    outcomes: SIM_NAO,
    criterio: "Resolve SIM se o Grêmio terminar a Série A de 2026 entre os quatro últimos colocados (17º a 20º), " +
      "rebaixado à Série B de 2027, conforme a classificação final da CBF. Resolve NÃO caso contrário.",
    fonte: "CBF — classificação oficial da Série A 2026",
    closeAt: "2026-12-02T16:00:00-03:00", resolveBy: "2026-12-15T23:59:59-03:00",
  },
  {
    slug: "campeao-libertadores-2026", categoria: "esportes",
    title: "Palmeiras x Estudiantes: quem leva a Libertadores 2026?",
    description: "Final em jogo único no sábado, 28/11, no Estadio Centenario, em Montevidéu. O Palmeiras eliminou o Fluminense nos pênaltis; o Estudiantes passou pelo Flamengo.",
    outcomes: [{ label: "Palmeiras" }, { label: "Estudiantes" }],
    criterio: "Resolve no clube campeão da final da Copa Libertadores de 2026, contando prorrogação e pênaltis. " +
      "Se a final for adiada para depois do prazo de resolução ou cancelada, o mercado é ANULADO.",
    fonte: "Conmebol — resultado oficial da final",
    closeAt: "2026-11-28T12:00:00-03:00", resolveBy: "2026-12-12T23:59:59-03:00",
  },
  {
    slug: "campeao-copa-do-brasil-2026", categoria: "esportes",
    title: "Quem será o campeão da Copa do Brasil 2026?",
    description: "Semifinais: Atlético-MG x Grêmio e Vasco x Palmeiras. A final é em jogo único, em 6/12.",
    outcomes: [{ label: "Atlético-MG" }, { label: "Grêmio" }, { label: "Vasco" }, { label: "Palmeiras" }],
    criterio: "Resolve no clube campeão da Copa do Brasil de 2026 (contando prorrogação e pênaltis), conforme a CBF. " +
      "O mercado segue aberto durante as semifinais.",
    fonte: "CBF — resultado oficial da final",
    closeAt: "2026-12-06T12:00:00-03:00", resolveBy: "2026-12-20T23:59:59-03:00",
  },
  {
    // Fecha antes da última etapa: o calendário exato das 3 últimas corridas
    // não foi conferido — se o título sair antes, resolve antes.
    slug: "antonelli-campeao-f1-2026", categoria: "esportes",
    title: "Kimi Antonelli será campeão da Fórmula 1 em 2026?",
    description: "Após o GP de Singapura, Antonelli (Mercedes) lidera com 340 pontos, contra 238 de George Russell e 229 de Lewis Hamilton.",
    outcomes: SIM_NAO,
    criterio: "Resolve SIM se Andrea Kimi Antonelli for o campeão mundial de pilotos da Fórmula 1 de 2026, conforme a classificação final da FIA. " +
      "Resolve NÃO se outro piloto for campeão.",
    fonte: "FIA / formula1.com — classificação final de pilotos 2026",
    closeAt: "2026-11-20T23:59:00-03:00", resolveBy: "2026-12-20T23:59:59-03:00",
  },
  // ------------------------------ Economia ---------------------------------
  {
    slug: "copom-novembro-2026-selic", categoria: "economia",
    title: "Copom de novembro: o que acontece com a Selic?",
    description: "A Selic está em 13,75% depois de cinco cortes seguidos em 2026. O Copom se reúne em 3 e 4 de novembro e o boletim Focus espera pausa.",
    outcomes: [{ label: "Corte" }, { label: "Mantém em 13,75%" }, { label: "Alta" }],
    criterio: "Resolve pela decisão do Copom anunciada em 4/11/2026: \"Corte\" se a meta da Selic ficar abaixo de 13,75%, " +
      "\"Mantém em 13,75%\" se não mudar, \"Alta\" se subir. Se a reunião for remarcada para depois de 30/11, o mercado é ANULADO.",
    fonte: "Banco Central do Brasil — comunicado do Copom",
    closeAt: "2026-11-04T12:00:00-03:00", resolveBy: "2026-11-11T23:59:59-03:00",
  },
  {
    slug: "copom-dezembro-2026-selic", categoria: "economia",
    title: "Qual será a Selic depois do último Copom de 2026?",
    description: "Hoje a Selic é 13,75%. Antes da reunião de 8 e 9 de dezembro, ainda tem o Copom de novembro.",
    outcomes: [{ label: "Abaixo de 13,75%" }, { label: "13,75%" }, { label: "Acima de 13,75%" }],
    criterio: "Resolve pela meta da Selic definida na reunião do Copom de 9/12/2026, comparada a 13,75% ao ano. " +
      "Se a reunião for remarcada para 2027, o mercado é ANULADO.",
    fonte: "Banco Central do Brasil — comunicado do Copom",
    closeAt: "2026-12-09T12:00:00-03:00", resolveBy: "2026-12-16T23:59:59-03:00",
  },
  {
    slug: "dolar-fim-2026-acima-5", categoria: "economia",
    title: "O dólar termina 2026 acima de R$ 5,00?",
    description: "A PTAX de venda fechou em R$ 5,0383 em 22/10/2026, às vésperas do 2º turno.",
    outcomes: SIM_NAO,
    criterio: "Resolve SIM se a última cotação PTAX de venda do dólar de 2026 divulgada pelo Banco Central for maior que R$ 5,0000. " +
      "Resolve NÃO caso contrário.",
    fonte: "Banco Central do Brasil — PTAX (último boletim de 2026)",
    closeAt: "2026-12-30T10:00:00-03:00", resolveBy: "2027-01-08T23:59:59-03:00",
  },
  {
    slug: "ibovespa-fim-2026-acima-200-mil", categoria: "economia",
    title: "O Ibovespa termina 2026 acima de 200 mil pontos?",
    description: "O Ibovespa fechou em 204.120 pontos em 22/10/2026, com queda de 1,15% antes do 2º turno.",
    outcomes: SIM_NAO,
    criterio: "Resolve SIM se o Ibovespa fechar o último pregão de 2026 acima de 200.000 pontos, conforme a B3. " +
      "Resolve NÃO caso contrário.",
    fonte: "B3 — fechamento oficial do Ibovespa",
    closeAt: "2026-12-30T10:00:00-03:00", resolveBy: "2027-01-08T23:59:59-03:00",
  },
  {
    slug: "ipca-2026-acima-teto-meta", categoria: "economia",
    title: "A inflação de 2026 vai estourar o teto da meta (4,5%)?",
    description: "O IPCA acumulado em 12 meses estava em 4,22% em agosto. A meta é 3%, com tolerância até 4,5%.",
    outcomes: SIM_NAO,
    criterio: "Resolve SIM se o IPCA acumulado de janeiro a dezembro de 2026, divulgado pelo IBGE, for maior que 4,50%. " +
      "Resolve NÃO caso contrário.",
    fonte: "IBGE — IPCA de dezembro de 2026",
    closeAt: "2026-12-31T23:59:00-03:00", resolveBy: "2027-01-25T23:59:59-03:00",
  },
];

async function main() {
  const pool = getPool();
  const sys = await pool.query(`SELECT id FROM users WHERE handle = 'sistema'`);
  const cats = await pool.query(`SELECT slug, id FROM categories WHERE slug IN ('esportes','economia')`);
  const cat = new Map(cats.rows.map((r) => [r.slug as string, r.id as string]));
  if (!sys.rowCount || cat.size < 2) throw new Error("Seed ausente: usuário 'sistema' / categorias 'esportes' e 'economia'");
  console.log(aplicar ? `== APLICANDO (${publicar ? "ABERTO" : "RASCUNHO"}) ==` : "== SIMULAÇÃO (use --aplicar) ==");

  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    for (const p of PACOTE) {
      const { created } = await createMarketIdempotent(c, {
        slug: p.slug, title: p.title, description: p.description,
        categoryId: cat.get(p.categoria)!, type: p.outcomes.length === 2 && p.outcomes[0].label === "SIM" ? "BINARY" : "MULTI",
        outcomes: p.outcomes, liquidityB: suggestB(p.outcomes.length, 60),
        status: publicar ? "OPEN" : "DRAFT",
        resolutionCriteria: p.criterio, resolutionSource: p.fonte,
        closeAt: p.closeAt, resolveBy: p.resolveBy, createdBy: sys.rows[0].id,
      });
      console.log(`${created ? (aplicar ? "CRIADO   " : "CRIARIA  ") : "JÁ EXISTE"} [${p.categoria}] ${p.title}`);
    }
    await c.query(aplicar ? "COMMIT" : "ROLLBACK");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
