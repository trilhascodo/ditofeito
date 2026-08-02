import { z } from "zod";
import { router, publicProcedure, protectedProcedure, adminProcedure, sponsorProcedure } from "../trpc/trpc.js";
import { notify } from "../domain/notify.js";
import { sendTransactionalEmail } from "../lib/email.js";
import { createPixPayment, createBoletoPayment, createCardPayment, MercadoPagoError } from "../lib/mercadoPago.js";
import { appendSponsorLedger, creditApprovedPayment } from "../domain/sponsorBilling.js";

// ----------------------------------------------------------------------------
// Patrocínio nativo (identidade-ditofeito.md — card "Apresentado por", nunca
// pop-up). Schema já existia desde o F0 (sponsors/sponsorships) sem nenhum
// código em cima; este router é a primeira peça em uso.
// ----------------------------------------------------------------------------
const HOME_PLACEMENTS = ["SIDEBAR", "BANNER", "GRID"] as const;

const REGION_SCOPES = ["NACIONAL", "ESTADUAL", "MUNICIPAL"] as const;

const sponsorshipBase = z.object({
  sponsorId: z.string().uuid(),
  // Ou marketId (card na página do mercado), ou isHome (espaço da home) —
  // mesma regra do CHECK no banco (migrations/004_sponsor_home_news.sql).
  marketId: z.string().uuid().optional(),
  isHome: z.boolean().default(false),
  // Só importa quando isHome — validado contra PLAN_ALLOWED_PLACEMENTS do
  // sponsor no mutation abaixo (não dá pra confiar só no zod aqui, precisa
  // do plano que está no banco).
  homePlacement: z.enum(HOME_PLACEMENTS).optional(),
  // Escopo regional do espaço de home (migrations/019_region_segmentation.sql)
  // — nacional é o padrão/comportamento de sempre. Só relevante quando isHome.
  regionScope: z.enum(REGION_SCOPES).default("NACIONAL"),
  regionUf: z.string().length(2).optional(),
  regionCity: z.string().trim().max(120).optional(),
  // Opcional de verdade — em branco não exibe rótulo nenhum (front trata
  // string vazia como "sem rótulo"), não cai num texto padrão escondido.
  label: z.string().trim().max(60).optional().transform((v) => v ?? ""),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

const sponsorshipInput = sponsorshipBase
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: "endsAt deve ser depois de startsAt",
    path: ["endsAt"],
  })
  .refine((d) => d.marketId || d.isHome, {
    message: "escolha um mercado ou marque como faixa da home",
    path: ["marketId"],
  })
  .refine((d) => !d.isHome || d.homePlacement, {
    message: "escolha a posição na home",
    path: ["homePlacement"],
  })
  .refine((d) => d.regionScope === "NACIONAL" || !!d.regionUf, {
    message: "escolha o estado pro escopo regional",
    path: ["regionUf"],
  })
  .refine((d) => d.regionScope !== "MUNICIPAL" || !!d.regionCity, {
    message: "escolha a cidade pro escopo municipal",
    path: ["regionCity"],
  });

// Mesmas regras de sponsorshipInput, só com o id do registro sendo editado
// — duplicado de propósito (encadear .refine() genérico sobre os dois
// schemas trava o TS em inferência de overload do zod).
const sponsorshipUpdateInput = sponsorshipBase
  .extend({ id: z.string().uuid() })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: "endsAt deve ser depois de startsAt",
    path: ["endsAt"],
  })
  .refine((d) => d.marketId || d.isHome, {
    message: "escolha um mercado ou marque como faixa da home",
    path: ["marketId"],
  })
  .refine((d) => !d.isHome || d.homePlacement, {
    message: "escolha a posição na home",
    path: ["homePlacement"],
  })
  .refine((d) => d.regionScope === "NACIONAL" || !!d.regionUf, {
    message: "escolha o estado pro escopo regional",
    path: ["regionUf"],
  })
  .refine((d) => d.regionScope !== "MUNICIPAL" || !!d.regionCity, {
    message: "escolha a cidade pro escopo municipal",
    path: ["regionCity"],
  });

// Mesmo shape de sponsorshipInput, sem `sponsorId` — pedido de autoatendimento
// nunca aceita sponsorId do cliente, sempre usa ctx.sponsorId (sponsorProcedure).
// Duplicado por causa do mesmo problema de inferência do zod citado acima.
const selfSponsorshipInput = sponsorshipBase
  .omit({ sponsorId: true })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: "endsAt deve ser depois de startsAt",
    path: ["endsAt"],
  })
  .refine((d) => d.marketId || d.isHome, {
    message: "escolha um mercado ou marque como faixa da home",
    path: ["marketId"],
  })
  .refine((d) => !d.isHome || d.homePlacement, {
    message: "escolha a posição na home",
    path: ["homePlacement"],
  })
  .refine((d) => d.regionScope === "NACIONAL" || !!d.regionUf, {
    message: "escolha o estado pro escopo regional",
    path: ["regionUf"],
  })
  .refine((d) => d.regionScope !== "MUNICIPAL" || !!d.regionCity, {
    message: "escolha a cidade pro escopo municipal",
    path: ["regionCity"],
  });

const SOCIAL_PLATFORMS = ["INSTAGRAM", "X", "TIKTOK", "YOUTUBE", "FACEBOOK", "WHATSAPP"] as const;
type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

// Limite de redes sociais no autoatendimento, por plano (migrations/009_sponsor_plans.sql).
const PLAN_LIMITS: Record<string, number> = { BASICO: 1, PROFISSIONAL: 3, PREMIUM: 5 };

// Posições que cada plano libera na home — CUMULATIVO (plano maior inclui os
// menores, como qualquer tabela de planos em camadas: Premium não faz
// sentido valer menos posições que Profissional). Mesmo mapeamento
// divulgado em /anuncie. O admin escolhe entre as opções liberadas — sem
// isso, um sponsor Premium não tinha como aparecer no nativo da grade
// (bug relatado: "não é possível adicionar nada ao grid").
const PLAN_ALLOWED_PLACEMENTS: Record<string, readonly (typeof HOME_PLACEMENTS)[number][]> = {
  BASICO: ["BANNER"],
  PROFISSIONAL: ["BANNER", "GRID"],
  PREMIUM: ["BANNER", "GRID", "SIDEBAR"],
};

// Preço por mês, em centavos — mesmo valor de /anuncie e do mídia kit
// (R$300/650/1.200). Fica em código, não em coluna: plano é enum fixo,
// preço muda raramente e nunca pelo próprio sponsor (ver 040_sponsor_billing.sql).
// approveSponsorship converte pra preço do período pedido (proporcional aos
// dias, não travado em "1 mês exato" — campanha pode durar qualquer período).
const PLAN_PRICE_CENTS: Record<string, number> = {
  BASICO: 30_000, PROFISSIONAL: 65_000, PREMIUM: 120_000,
};

function priceForPeriodCents(plan: string, startsAt: Date, endsAt: Date): number {
  const days = Math.max(1, (endsAt.getTime() - startsAt.getTime()) / 86_400_000);
  const monthly = PLAN_PRICE_CENTS[plan] ?? PLAN_PRICE_CENTS.BASICO;
  return Math.round((monthly / 30) * days);
}

// appendSponsorLedger/creditApprovedPayment vivem em domain/sponsorBilling.ts
// (compartilhado com http/mercadoPagoWebhook.ts — único caminho de código
// que credita saldo por pagamento aprovado, ver comentário lá).

// status_detail documentados pelo Mercado Pago pra recusa de cartão
// (checkout-api-payments/how-tos/reasons-for-rejection) — fallback genérico
// pros não mapeados, ver createTopup abaixo.
const CARD_REJECTION_MESSAGES: Record<string, string> = {
  cc_rejected_bad_filled_card_number: "Número do cartão incorreto — confira e tente de novo.",
  cc_rejected_bad_filled_date: "Validade do cartão incorreta — confira e tente de novo.",
  cc_rejected_bad_filled_security_code: "Código de segurança (CVV) incorreto — confira e tente de novo.",
  cc_rejected_bad_filled_other: "Dados do cartão incorretos — confira e tente de novo.",
  cc_rejected_call_for_authorize: "Seu banco pediu autorização manual — ligue pra central do cartão ou use outro método.",
  cc_rejected_card_disabled: "Cartão desabilitado — ligue pra central do seu banco ou use outro cartão.",
  cc_rejected_duplicated_payment: "Já existe uma cobrança igual em andamento — aguarde ou confira o extrato antes de tentar de novo.",
  cc_rejected_insufficient_amount: "Saldo/limite insuficiente no cartão.",
  cc_rejected_invalid_installments: "Esse cartão não aceita pagamento à vista — tente outro cartão.",
  cc_rejected_max_attempts: "Número máximo de tentativas atingido — tente outro cartão ou use Pix/boleto.",
  cc_rejected_blacklist: "Pagamento não autorizado pelo seu banco.",
  cc_rejected_high_risk: "Pagamento recusado por segurança — tente outro cartão ou use Pix/boleto.",
  cc_rejected_other_reason: "Pagamento recusado pelo seu banco — tente outro cartão ou use Pix/boleto.",
};

// Valida a posição da home contra o plano do sponsor (cumulativo, ver
// PLAN_ALLOWED_PLACEMENTS acima). Usada tanto na criação quanto na edição —
// se o admin trocar o patrocinador de uma sponsorship existente, ou o
// próprio plano mudar depois, a posição atual pode não ser mais válida.
async function resolveHomePlacement(
  pool: import("pg").Pool,
  input: { sponsorId: string; isHome: boolean; homePlacement?: string },
): Promise<"SIDEBAR" | "BANNER" | "GRID"> {
  if (!input.isHome) return "SIDEBAR";
  const s = await pool.query(`SELECT plan FROM sponsors WHERE id = $1`, [input.sponsorId]);
  if (!s.rowCount) throw new Error("Patrocinador não encontrado");
  const allowed = PLAN_ALLOWED_PLACEMENTS[s.rows[0].plan as string] ?? PLAN_ALLOWED_PLACEMENTS.BASICO;
  if (!input.homePlacement || !allowed.includes(input.homePlacement as (typeof HOME_PLACEMENTS)[number]))
    throw new Error(`Plano ${s.rows[0].plan} não inclui essa posição (libera: ${allowed.join(", ")})`);
  return input.homePlacement as "SIDEBAR" | "BANNER" | "GRID";
}

// Espaço de home é cumulativo por natureza (várias sponsorships dividem a
// mesma posição por rodízio, getActiveHome ORDER BY random()) — overlap ali
// é esperado. Card de mercado é diferente: getActiveForMarket só mostra UM
// patrocínio por vez (o mais recente), então vender o mesmo mercado/período
// pra dois patrocinadores desperdiça um deles em silêncio sem essa checagem.
async function assertNoMarketOverlap(
  pool: import("pg").Pool,
  input: { marketId?: string; isHome: boolean; startsAt: string; endsAt: string },
  excludeId?: string,
): Promise<void> {
  if (input.isHome || !input.marketId) return;
  const r = await pool.query(
    `SELECT sp.id, s.name FROM sponsorships sp
       JOIN sponsors s ON s.id = sp.sponsor_id
      WHERE sp.market_id = $1 AND sp.id != $2
        AND sp.starts_at < $3 AND sp.ends_at > $4`,
    [input.marketId, excludeId ?? "00000000-0000-0000-0000-000000000000", input.endsAt, input.startsAt],
  );
  if (r.rowCount) {
    throw new Error(
      `Esse mercado já tem patrocínio de "${r.rows[0].name}" nesse período — só um aparece por vez `
      + `no card do mercado. Ajuste as datas ou remova o outro patrocínio antes.`,
    );
  }
}

async function socialLinksBySponsor(pool: import("pg").Pool, sponsorIds: string[]) {
  const map = new Map<string, { id: string; platform: SocialPlatform; url: string }[]>();
  if (sponsorIds.length === 0) return map;
  const r = await pool.query(
    `SELECT id, sponsor_id, platform, url FROM sponsor_social_links
      WHERE sponsor_id = ANY($1) ORDER BY sponsor_id, display_order`,
    [sponsorIds]);
  for (const row of r.rows) {
    const arr = map.get(row.sponsor_id) ?? [];
    arr.push({ id: row.id, platform: row.platform, url: row.url });
    map.set(row.sponsor_id, arr);
  }
  return map;
}

// Avisa (in-app + e-mail) toda conta SPONSOR vinculada ao sponsor — normalmente
// uma só, mas linkUser não impede vincular mais de uma. E-mail nunca derruba a
// mutation principal (mesma convenção de auth.ts: falha vira log, não erro).
async function notifySponsorUsers(
  pool: import("pg").Pool,
  sponsorId: string,
  kind: "SPONSOR_REVIEW_APPROVED" | "SPONSOR_REVIEW_REJECTED",
  body: string,
  email: { subject: string; html: string },
): Promise<void> {
  const r = await pool.query(
    `SELECT id, email FROM users WHERE sponsor_id = $1 AND role = 'SPONSOR'`, [sponsorId]);
  for (const row of r.rows) {
    await notify(pool, row.id as string, kind, body);
    sendTransactionalEmail(pool, { to: row.email as string, ...email })
      .catch((e) => console.error("[sponsor] envio de e-mail falhou", e));
  }
}

export const sponsorRouter = router({
  // ---- ADMIN: cadastro de patrocinadores ----------------------------------
  list: adminProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT id, name, logo_url, site_url, creative_url, pending_creative_url,
              creative_review_status, creative_admin_note, is_active, plan
         FROM sponsors ORDER BY name`);
    const links = await socialLinksBySponsor(ctx.pool, r.rows.map((s) => s.id as string));
    return r.rows.map((s) => ({
      id: s.id as string, name: s.name as string,
      logoUrl: s.logo_url as string | null, siteUrl: s.site_url as string | null,
      creativeUrl: s.creative_url as string | null,
      pendingCreativeUrl: s.pending_creative_url as string | null,
      creativeReviewStatus: s.creative_review_status as "NONE" | "PENDING" | "APPROVED" | "REJECTED",
      creativeAdminNote: s.creative_admin_note as string | null,
      isActive: s.is_active as boolean, plan: s.plan as string,
      socialLinks: links.get(s.id as string) ?? [],
    }));
  }),

  create: adminProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(120),
      logoUrl: z.string().trim().url().optional(),
      siteUrl: z.string().trim().url().optional(),
      // Arte pronta do anunciante (fundo+headline+CTA embutidos) — quando
      // presente, substitui o card composto logo+nome+CTA na coluna lateral.
      creativeUrl: z.string().trim().url().optional(),
      plan: z.enum(["BASICO", "PROFISSIONAL", "PREMIUM"]).default("BASICO"),
    }))
    .mutation(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `INSERT INTO sponsors (name, logo_url, site_url, creative_url, plan) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [input.name, input.logoUrl ?? null, input.siteUrl ?? null, input.creativeUrl ?? null, input.plan]);
      return { id: r.rows[0].id as string };
    }),

  setActive: adminProcedure
    .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(`UPDATE sponsors SET is_active = $2 WHERE id = $1`, [input.id, input.isActive]);
      return { ok: true };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
      logoUrl: z.string().trim().url().optional(),
      siteUrl: z.string().trim().url().optional(),
      creativeUrl: z.string().trim().url().optional(),
      plan: z.enum(["BASICO", "PROFISSIONAL", "PREMIUM"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(
        `UPDATE sponsors SET name = $2, logo_url = $3, site_url = $4, creative_url = $5, plan = $6 WHERE id = $1`,
        [input.id, input.name, input.logoUrl ?? null, input.siteUrl ?? null, input.creativeUrl ?? null, input.plan]);
      return { ok: true };
    }),

  // ---- ADMIN: vincular conta de anunciante a um sponsor -------------------
  // Só promove conta USER comum — nunca rebaixa admin/moderador por handle
  // errado, e nunca reusa um handle já vinculado a outro papel de staff.
  linkUser: adminProcedure
    .input(z.object({ sponsorId: z.string().uuid(), handle: z.string().trim().toLowerCase() }))
    .mutation(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `UPDATE users SET role = 'SPONSOR', sponsor_id = $1, updated_at = now()
          WHERE handle = $2 AND role = 'USER' RETURNING id`,
        [input.sponsorId, input.handle]);
      if (!r.rowCount) throw new Error("Usuário não encontrado ou já tem outro papel no site");
      return { ok: true };
    }),

  // ---- AUTOATENDIMENTO: virar anunciante é instantâneo --------------------
  // Sem fila de aprovação pra conta em si: nada fica público sem passar pela
  // aprovação de campanha (approveSponsorship) ou de arte (approveCreative),
  // que continuam existindo — revisar a CONTA também só duplicava esse
  // controle e atrasava sem ganho nenhum ("autoatendimento" que na prática
  // ainda esperava retorno de alguém não é autoatendimento).
  becomeSponsor: protectedProcedure
    .input(z.object({
      companyName: z.string().trim().min(1).max(120),
      plan: z.enum(["BASICO", "PROFISSIONAL", "PREMIUM"]).default("BASICO"),
      siteUrl: z.string().trim().url().optional(),
      logoUrl: z.string().trim().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "USER")
        throw new Error("Essa conta já tem outro papel no site — fale com o suporte.");
      if (!ctx.user.emailVerified)
        throw new Error("Confirme seu e-mail antes de virar anunciante.");
      const client = await ctx.pool.connect();
      try {
        await client.query("BEGIN");
        const sp = await client.query(
          `INSERT INTO sponsors (name, logo_url, site_url, plan) VALUES ($1,$2,$3,$4) RETURNING id`,
          [input.companyName, input.logoUrl ?? null, input.siteUrl ?? null, input.plan]);
        const sponsorId = sp.rows[0].id as string;
        const promoted = await client.query(
          `UPDATE users SET role = 'SPONSOR', sponsor_id = $1, updated_at = now()
             WHERE id = $2 AND role = 'USER' RETURNING id`,
          [sponsorId, ctx.user.id]);
        if (!promoted.rowCount) throw new Error("Não foi possível criar a conta de anunciante.");
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      return { ok: true };
    }),

  // ---- ADMIN: vínculo patrocinador <-> mercado ----------------------------
  listSponsorships: adminProcedure
    .input(z.object({ marketId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const params: unknown[] = [];
      let where = "";
      if (input?.marketId) { params.push(input.marketId); where = "WHERE sp.market_id = $1"; }
      const r = await ctx.pool.query(
        `SELECT sp.id, sp.label, sp.starts_at, sp.ends_at, sp.market_id, sp.is_home, sp.home_placement,
                sp.region_scope, sp.region_uf, sp.region_city,
                s.id AS sponsor_id, s.name AS sponsor_name, s.logo_url, s.site_url,
                m.title AS market_title, m.slug AS market_slug
           FROM sponsorships sp
           JOIN sponsors s ON s.id = sp.sponsor_id
           LEFT JOIN markets m ON m.id = sp.market_id
           ${where}
          ORDER BY sp.starts_at DESC`, params);
      return r.rows.map((row) => ({
        id: row.id as string, label: row.label as string,
        startsAt: row.starts_at as string, endsAt: row.ends_at as string,
        marketId: row.market_id as string | null, isHome: row.is_home as boolean,
        homePlacement: row.home_placement as "SIDEBAR" | "BANNER" | "GRID",
        regionScope: row.region_scope as "NACIONAL" | "ESTADUAL" | "MUNICIPAL",
        regionUf: row.region_uf as string | null, regionCity: row.region_city as string | null,
        marketTitle: row.market_title as string | null, marketSlug: row.market_slug as string | null,
        sponsor: {
          id: row.sponsor_id as string, name: row.sponsor_name as string,
          logoUrl: row.logo_url as string | null, siteUrl: row.site_url as string | null,
        },
      }));
    }),

  createSponsorship: adminProcedure.input(sponsorshipInput).mutation(async ({ ctx, input }) => {
    const homePlacement = await resolveHomePlacement(ctx.pool, input);
    await assertNoMarketOverlap(ctx.pool, input);
    const r = await ctx.pool.query(
      `INSERT INTO sponsorships
         (sponsor_id, market_id, is_home, home_placement, region_scope, region_uf, region_city,
          label, starts_at, ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [input.sponsorId, input.marketId ?? null, input.isHome, homePlacement,
        input.regionScope, input.regionUf ?? null, input.regionCity?.trim() || null,
        input.label, input.startsAt, input.endsAt]);
    return { id: r.rows[0].id as string };
  }),

  updateSponsorship: adminProcedure.input(sponsorshipUpdateInput).mutation(async ({ ctx, input }) => {
    const homePlacement = await resolveHomePlacement(ctx.pool, input);
    await assertNoMarketOverlap(ctx.pool, input, input.id);
    const r = await ctx.pool.query(
      `UPDATE sponsorships
          SET sponsor_id = $2, market_id = $3, is_home = $4, home_placement = $5,
              region_scope = $6, region_uf = $7, region_city = $8,
              label = $9, starts_at = $10, ends_at = $11
        WHERE id = $1 RETURNING id`,
      [input.id, input.sponsorId, input.marketId ?? null, input.isHome, homePlacement,
        input.regionScope, input.regionUf ?? null, input.regionCity?.trim() || null,
        input.label, input.startsAt, input.endsAt]);
    if (!r.rowCount) throw new Error("Patrocínio não encontrado");
    return { ok: true };
  }),

  removeSponsorship: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(`DELETE FROM sponsorships WHERE id = $1`, [input.id]);
      return { ok: true };
    }),

  // ---- ADMIN: fila de aprovação de campanhas pedidas em autoatendimento ---
  listPendingSponsorships: adminProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT sp.id, sp.label, sp.starts_at, sp.ends_at, sp.market_id, sp.is_home, sp.home_placement,
              sp.region_scope, sp.region_uf, sp.region_city,
              s.id AS sponsor_id, s.name AS sponsor_name,
              m.title AS market_title, m.slug AS market_slug
         FROM sponsorships sp
         JOIN sponsors s ON s.id = sp.sponsor_id
         LEFT JOIN markets m ON m.id = sp.market_id
        WHERE sp.approval_status = 'PENDING'
        ORDER BY sp.starts_at ASC`);
    return r.rows.map((row) => ({
      id: row.id as string, label: row.label as string,
      startsAt: row.starts_at as string, endsAt: row.ends_at as string,
      marketId: row.market_id as string | null, isHome: row.is_home as boolean,
      homePlacement: row.home_placement as "SIDEBAR" | "BANNER" | "GRID",
      regionScope: row.region_scope as "NACIONAL" | "ESTADUAL" | "MUNICIPAL",
      regionUf: row.region_uf as string | null, regionCity: row.region_city as string | null,
      marketTitle: row.market_title as string | null, marketSlug: row.market_slug as string | null,
      sponsor: { id: row.sponsor_id as string, name: row.sponsor_name as string },
    }));
  }),

  // Aprovar cobra o saldo pré-pago pelo período pedido, atômico com a
  // aprovação em si (migrations/040_sponsor_billing.sql) — nunca cobra sem
  // aprovar, nunca aprova sem cobrar. Só se aplica a essa procedure porque
  // só ela mexe em sponsorship PENDING: createSponsorship (admin cria
  // direto) já nasce APPROVED, fora do saldo pré-pago — deal negociado
  // manualmente, mesmo tratamento "sob consulta" de sempre.
  approveSponsorship: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.pool.connect();
      let sponsorId: string;
      try {
        await client.query("BEGIN");
        const sp = await client.query(
          `SELECT sponsor_id, starts_at, ends_at FROM sponsorships
            WHERE id = $1 AND approval_status = 'PENDING' FOR UPDATE`,
          [input.id],
        );
        if (!sp.rowCount) throw new Error("Patrocínio não encontrado ou já decidido");
        sponsorId = sp.rows[0].sponsor_id as string;

        const s = await client.query(
          `SELECT plan, balance_cents FROM sponsors WHERE id = $1 FOR UPDATE`, [sponsorId]);
        const price = priceForPeriodCents(
          s.rows[0].plan as string, sp.rows[0].starts_at as Date, sp.rows[0].ends_at as Date,
        );
        const balance = Number(s.rows[0].balance_cents);
        if (balance < price) {
          throw new Error(
            `Saldo insuficiente: precisa de R$ ${(price / 100).toFixed(2)}, `
            + `tem R$ ${(balance / 100).toFixed(2)} — peça pro patrocinador recarregar antes de aprovar.`,
          );
        }

        await appendSponsorLedger(client, sponsorId, -price, "CAMPAIGN_CHARGE", { sponsorshipId: input.id });
        await client.query(`UPDATE sponsorships SET approval_status = 'APPROVED' WHERE id = $1`, [input.id]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      await notifySponsorUsers(
        ctx.pool, sponsorId, "SPONSOR_REVIEW_APPROVED",
        "Seu patrocínio foi aprovado e já está no ar.",
        { subject: "Patrocínio aprovado — DitoFeito", html: "<p>Seu patrocínio foi aprovado e já está no ar.</p>" },
      );
      return { ok: true };
    }),

  rejectSponsorship: adminProcedure
    .input(z.object({ id: z.string().uuid(), adminNote: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `UPDATE sponsorships SET approval_status = 'REJECTED', admin_note = $2
           WHERE id = $1 AND approval_status = 'PENDING' RETURNING sponsor_id`, [input.id, input.adminNote]);
      if (!r.rowCount) throw new Error("Patrocínio não encontrado ou já decidido");
      await notifySponsorUsers(
        ctx.pool, r.rows[0].sponsor_id as string, "SPONSOR_REVIEW_REJECTED",
        `Seu pedido de patrocínio não foi aprovado: ${input.adminNote}`,
        { subject: "Sobre seu pedido de patrocínio — DitoFeito",
          html: `<p>Seu pedido de patrocínio não foi aprovado.</p><p>${input.adminNote}</p>` },
      );
      return { ok: true };
    }),

  // ---- ADMIN: fila de aprovação de arte enviada em autoatendimento --------
  approveCreative: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `UPDATE sponsors SET creative_url = pending_creative_url, pending_creative_url = NULL,
                creative_review_status = 'NONE', creative_admin_note = NULL
           WHERE id = $1 AND creative_review_status = 'PENDING' RETURNING id`, [input.id]);
      if (!r.rowCount) throw new Error("Arte não encontrada ou já decidida");
      await notifySponsorUsers(
        ctx.pool, input.id, "SPONSOR_REVIEW_APPROVED",
        "Sua arte foi aprovada e já está no ar.",
        { subject: "Arte aprovada — DitoFeito", html: "<p>Sua arte foi aprovada e já está no ar.</p>" },
      );
      return { ok: true };
    }),

  rejectCreative: adminProcedure
    .input(z.object({ id: z.string().uuid(), adminNote: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `UPDATE sponsors SET pending_creative_url = NULL, creative_review_status = 'NONE',
                creative_admin_note = $2
           WHERE id = $1 AND creative_review_status = 'PENDING' RETURNING id`, [input.id, input.adminNote]);
      if (!r.rowCount) throw new Error("Arte não encontrada ou já decidida");
      await notifySponsorUsers(
        ctx.pool, input.id, "SPONSOR_REVIEW_REJECTED",
        `Sua arte não foi aprovada: ${input.adminNote}`,
        { subject: "Sobre sua arte — DitoFeito", html: `<p>Sua arte não foi aprovada.</p><p>${input.adminNote}</p>` },
      );
      return { ok: true };
    }),

  // ---- AUTOATENDIMENTO: painel do anunciante (só a própria conta) ---------
  getMine: sponsorProcedure.query(async ({ ctx }) => {
    const s = await ctx.pool.query(
      `SELECT name, logo_url, site_url, creative_url, pending_creative_url,
              creative_review_status, creative_admin_note, plan, balance_cents, tax_id
         FROM sponsors WHERE id = $1`, [ctx.sponsorId]);
    if (!s.rowCount) throw new Error("Patrocinador não encontrado");
    const links = await socialLinksBySponsor(ctx.pool, [ctx.sponsorId]);
    // E-mail de quem está logado — pré-preenche o payer do Card Payment
    // Brick na recarga por cartão (ver createTopup abaixo).
    const u = await ctx.pool.query(`SELECT email FROM users WHERE id = $1`, [ctx.user.id]);
    const row = s.rows[0];
    return {
      name: row.name as string, logoUrl: row.logo_url as string | null,
      siteUrl: row.site_url as string | null, creativeUrl: row.creative_url as string | null,
      pendingCreativeUrl: row.pending_creative_url as string | null,
      creativeReviewStatus: row.creative_review_status as "NONE" | "PENDING" | "APPROVED" | "REJECTED",
      creativeAdminNote: row.creative_admin_note as string | null,
      plan: row.plan as string,
      socialLinksMax: PLAN_LIMITS[row.plan] ?? 1,
      socialLinks: links.get(ctx.sponsorId) ?? [],
      balanceCents: Number(row.balance_cents), taxId: row.tax_id as string | null,
      email: u.rows[0]?.email as string | undefined,
    };
  }),

  // Arte nova/trocada fica pendente de revisão editorial (nunca pula a fila,
  // mesmo pra sponsor antigo — só assim a regra de "nunca publicidade de
  // candidato/partido" é garantida, ver Metodologia §7). Campo em branco
  // (remover a arte) é seguro aplicar na hora: só reduz conteúdo, não
  // adiciona nada novo pra revisar.
  updateMine: sponsorProcedure
    .input(z.object({
      logoUrl: z.string().trim().url().optional(),
      siteUrl: z.string().trim().url().optional(),
      creativeUrl: z.string().trim().url().optional(),
      // CPF/CNPJ só-números, opcional — usado como payer.identification na
      // recarga via Mercado Pago (createTopup abaixo); alguns métodos de
      // pagamento exigem, outros não, por isso fica opcional aqui e só
      // reclama na hora de criar a cobrança se o Mercado Pago recusar sem ele.
      taxId: z.string().trim().regex(/^\d{11}$|^\d{14}$/, "CPF (11 dígitos) ou CNPJ (14)").optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.pool.query(`SELECT creative_url FROM sponsors WHERE id = $1`, [ctx.sponsorId]);
      const liveCreative = current.rows[0]?.creative_url as string | null;

      if (input.creativeUrl === undefined) {
        await ctx.pool.query(
          `UPDATE sponsors SET logo_url = $2, site_url = $3, creative_url = NULL,
                  pending_creative_url = NULL, creative_review_status = 'NONE', tax_id = $4
            WHERE id = $1`,
          [ctx.sponsorId, input.logoUrl ?? null, input.siteUrl ?? null, input.taxId ?? null]);
      } else if (input.creativeUrl === liveCreative) {
        await ctx.pool.query(
          `UPDATE sponsors SET logo_url = $2, site_url = $3, tax_id = $4 WHERE id = $1`,
          [ctx.sponsorId, input.logoUrl ?? null, input.siteUrl ?? null, input.taxId ?? null]);
      } else {
        await ctx.pool.query(
          `UPDATE sponsors SET logo_url = $2, site_url = $3, tax_id = $5,
                  pending_creative_url = $4, creative_review_status = 'PENDING'
            WHERE id = $1`,
          [ctx.sponsorId, input.logoUrl ?? null, input.siteUrl ?? null, input.creativeUrl, input.taxId ?? null]);
      }
      return { ok: true };
    }),

  // ---- AUTOATENDIMENTO: saldo pré-pago (migrations/040_sponsor_billing.sql) --
  // Saldo atual + extrato + pagamentos em aberto (pro front reabrir o QR
  // code se a pessoa navegar pra outra aba antes de pagar).
  myBalance: sponsorProcedure.query(async ({ ctx }) => {
    const s = await ctx.pool.query(`SELECT balance_cents FROM sponsors WHERE id = $1`, [ctx.sponsorId]);
    const ledger = await ctx.pool.query(
      `SELECT id, delta_cents, balance_after_cents, reason, created_at
         FROM sponsor_ledger WHERE sponsor_id = $1 ORDER BY id DESC LIMIT 30`,
      [ctx.sponsorId],
    );
    const pending = await ctx.pool.query(
      `SELECT id, mp_payment_id, method, amount_cents, qr_code, boleto_url, created_at
         FROM sponsor_payments WHERE sponsor_id = $1 AND status = 'PENDING'
        ORDER BY created_at DESC`,
      [ctx.sponsorId],
    );
    return {
      balanceCents: Number(s.rows[0]?.balance_cents ?? 0),
      ledger: ledger.rows.map((r) => ({
        id: String(r.id), deltaCents: Number(r.delta_cents), balanceAfterCents: Number(r.balance_after_cents),
        reason: r.reason as string, createdAt: r.created_at as string,
      })),
      pendingPayments: pending.rows.map((r) => ({
        id: r.id as string, method: r.method as "PIX" | "BOLETO" | "CARD", amountCents: Number(r.amount_cents),
        qrCode: r.qr_code as string | null, boletoUrl: r.boleto_url as string | null,
        createdAt: r.created_at as string,
      })),
    };
  }),

  // Gera uma cobrança nova no Mercado Pago e guarda a tentativa. Pix/boleto
  // só viram saldo de verdade quando o webhook confirmar (getPayment como
  // fonte de verdade, nunca o corpo do POST — ver http/mercadoPagoWebhook.ts).
  // Cartão aprova na hora (resposta síncrona do Mercado Pago) — credita
  // imediatamente via creditApprovedPayment, a mesma função idempotente que
  // o webhook usa, então uma reentrega do webhook pro mesmo pagamento não
  // credita de novo.
  createTopup: sponsorProcedure
    .input(z.discriminatedUnion("method", [
      z.object({
        method: z.literal("PIX"),
        amountCents: z.number().int().min(5_000, "mínimo R$ 50").max(5_000_000, "máximo R$ 50.000"),
      }),
      z.object({
        method: z.literal("BOLETO"),
        amountCents: z.number().int().min(5_000, "mínimo R$ 50").max(5_000_000, "máximo R$ 50.000"),
      }),
      z.object({
        method: z.literal("CARD"),
        amountCents: z.number().int().min(5_000, "mínimo R$ 50").max(5_000_000, "máximo R$ 50.000"),
        // Token de uso único do Card Payment Brick (tokenização no
        // navegador) — nunca chega número de cartão/CVV aqui.
        token: z.string().min(1),
        paymentMethodId: z.string().min(1),
        issuerId: z.string().optional(),
        paymentMethodOptionId: z.string().optional(),
        payerEmail: z.string().email(),
        payerTaxId: z.string().regex(/^\d{11}$|^\d{14}$/, "CPF (11 dígitos) ou CNPJ (14)"),
      }),
    ]))
    .mutation(async ({ ctx, input }) => {
      const s = await ctx.pool.query(`SELECT name, tax_id FROM sponsors WHERE id = $1`, [ctx.sponsorId]);
      if (!s.rowCount) throw new Error("Patrocinador não encontrado");
      const description = `Recarga de saldo DitoFeito — ${s.rows[0].name as string}`;

      if (input.method === "CARD") {
        try {
          const r = await createCardPayment({
            amountCents: input.amountCents, description, token: input.token,
            paymentMethodId: input.paymentMethodId, issuerId: input.issuerId,
            paymentMethodOptionId: input.paymentMethodOptionId,
            payer: { email: input.payerEmail, taxId: input.payerTaxId },
          });
          if (r.status === "rejected") {
            await ctx.pool.query(
              `INSERT INTO sponsor_payments (sponsor_id, mp_payment_id, method, amount_cents, status, card_last4, card_brand)
               VALUES ($1,$2,'CARD',$3,'REJECTED',$4,$5)`,
              [ctx.sponsorId, r.mpPaymentId, input.amountCents, r.cardLast4, r.cardBrand],
            );
            throw new Error(
              (r.statusDetail && CARD_REJECTION_MESSAGES[r.statusDetail])
              ?? "Pagamento recusado pelo seu banco — tente outro cartão ou use Pix/boleto.",
            );
          }
          // approved ou in_process: grava PENDING sempre — creditApprovedPayment
          // (idempotente) é o único caminho que efetivamente credita saldo,
          // mesmo quando já sabemos que veio "approved" aqui.
          const inserted = await ctx.pool.query(
            `INSERT INTO sponsor_payments (sponsor_id, mp_payment_id, method, amount_cents, status, card_last4, card_brand)
             VALUES ($1,$2,'CARD',$3,'PENDING',$4,$5) RETURNING id`,
            [ctx.sponsorId, r.mpPaymentId, input.amountCents, r.cardLast4, r.cardBrand],
          );
          if (r.status === "approved") {
            try {
              await creditApprovedPayment(ctx.pool, inserted.rows[0].id as string);
            } catch (e) {
              // Dinheiro já foi cobrado de verdade no Mercado Pago — diferente
              // de Pix/Boleto, que só "prometem" cobrança até serem pagos.
              // Log gritante pra reconciliar manualmente contra o extrato do
              // Mercado Pago; o webhook ainda vai chegar e tentar de novo.
              console.error("[sponsor.createTopup] cartão aprovado mas falhou ao creditar saldo — reconciliar manualmente", r.mpPaymentId, e);
            }
          }
          return {
            qrCode: null, qrCodeBase64: null, boletoUrl: null,
            cardStatus: r.status as "approved" | "in_process", cardLast4: r.cardLast4,
          };
        } catch (e) {
          if (e instanceof MercadoPagoError)
            throw new Error(`Não foi possível processar o cartão: ${e.message}`);
          throw e;
        }
      }

      const u = await ctx.pool.query(`SELECT email FROM users WHERE id = $1`, [ctx.user.id]);
      const payer = { email: u.rows[0].email as string, taxId: s.rows[0].tax_id as string | null };

      try {
        if (input.method === "PIX") {
          const r = await createPixPayment({ amountCents: input.amountCents, description, payer });
          await ctx.pool.query(
            `INSERT INTO sponsor_payments (sponsor_id, mp_payment_id, method, amount_cents, status, qr_code)
             VALUES ($1,$2,'PIX',$3,'PENDING',$4)`,
            [ctx.sponsorId, r.mpPaymentId, input.amountCents, r.qrCode],
          );
          return { qrCode: r.qrCode, qrCodeBase64: r.qrCodeBase64, boletoUrl: null, cardStatus: null, cardLast4: null };
        }
        const r = await createBoletoPayment({ amountCents: input.amountCents, description, payer });
        await ctx.pool.query(
          `INSERT INTO sponsor_payments (sponsor_id, mp_payment_id, method, amount_cents, status, boleto_url)
           VALUES ($1,$2,'BOLETO',$3,'PENDING',$4)`,
          [ctx.sponsorId, r.mpPaymentId, input.amountCents, r.boletoUrl],
        );
        return { qrCode: null, qrCodeBase64: null, boletoUrl: r.boletoUrl, cardStatus: null, cardLast4: null };
      } catch (e) {
        if (e instanceof MercadoPagoError)
          throw new Error(`Não foi possível gerar a cobrança: ${e.message}`);
        throw e;
      }
    }),

  // ---- AUTOATENDIMENTO: campanhas (sponsorships) da própria conta ---------
  listMySponsorships: sponsorProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT sp.id, sp.label, sp.starts_at, sp.ends_at, sp.market_id, sp.is_home, sp.home_placement,
              sp.region_scope, sp.region_uf, sp.region_city, sp.approval_status, sp.admin_note,
              m.title AS market_title, m.slug AS market_slug
         FROM sponsorships sp
         LEFT JOIN markets m ON m.id = sp.market_id
        WHERE sp.sponsor_id = $1
        ORDER BY sp.starts_at DESC`, [ctx.sponsorId]);
    return r.rows.map((row) => ({
      id: row.id as string, label: row.label as string,
      startsAt: row.starts_at as string, endsAt: row.ends_at as string,
      marketId: row.market_id as string | null, isHome: row.is_home as boolean,
      homePlacement: row.home_placement as "SIDEBAR" | "BANNER" | "GRID",
      regionScope: row.region_scope as "NACIONAL" | "ESTADUAL" | "MUNICIPAL",
      regionUf: row.region_uf as string | null, regionCity: row.region_city as string | null,
      approvalStatus: row.approval_status as "PENDING" | "APPROVED" | "REJECTED",
      adminNote: row.admin_note as string | null,
      marketTitle: row.market_title as string | null, marketSlug: row.market_slug as string | null,
    }));
  }),

  // Desempenho dos próprios patrocínios vigentes (últimos 30 dias) — mesma
  // query de adEvents.stats (admin), escopada pro sponsor logado. Anuncie.tsx
  // promete "relatório de desempenho... medido direto no portal" incluso em
  // qualquer plano; até aqui só o admin via esse número (adEvents.stats é
  // adminProcedure), o patrocinador nunca via a própria campanha performar.
  myStats: sponsorProcedure.query(async ({ ctx }) => {
    const r = await ctx.pool.query(
      `SELECT sp.id AS sponsorship_id, sp.label, sp.is_home, sp.home_placement,
              m.title AS market_title,
              count(*) FILTER (WHERE ae.kind = 'IMPRESSION') AS impressions,
              count(DISTINCT ae.visitor_hash) FILTER (WHERE ae.kind = 'IMPRESSION') AS unique_impressions,
              count(*) FILTER (WHERE ae.kind = 'CLICK') AS clicks
         FROM sponsorships sp
         LEFT JOIN markets m ON m.id = sp.market_id
         LEFT JOIN ad_events ae ON ae.sponsorship_id = sp.id
                                AND ae.created_at > now() - interval '30 days'
        WHERE sp.sponsor_id = $1 AND sp.approval_status = 'APPROVED' AND now() < sp.ends_at
        GROUP BY sp.id, sp.label, sp.is_home, sp.home_placement, m.title
        ORDER BY impressions DESC`,
      [ctx.sponsorId],
    );
    return r.rows.map((row) => ({
      sponsorshipId: row.sponsorship_id as string, label: row.label as string,
      isHome: row.is_home as boolean, homePlacement: row.home_placement as string | null,
      marketTitle: row.market_title as string | null,
      impressions: Number(row.impressions), uniqueImpressions: Number(row.unique_impressions),
      clicks: Number(row.clicks),
    }));
  }),

  requestSponsorship: sponsorProcedure.input(selfSponsorshipInput).mutation(async ({ ctx, input }) => {
    const full = { ...input, sponsorId: ctx.sponsorId };
    const homePlacement = await resolveHomePlacement(ctx.pool, full);
    await assertNoMarketOverlap(ctx.pool, full);
    const r = await ctx.pool.query(
      `INSERT INTO sponsorships
         (sponsor_id, market_id, is_home, home_placement, region_scope, region_uf, region_city,
          label, starts_at, ends_at, approval_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING') RETURNING id`,
      [ctx.sponsorId, full.marketId ?? null, full.isHome, homePlacement,
        full.regionScope, full.regionUf ?? null, full.regionCity?.trim() || null,
        full.label, full.startsAt, full.endsAt]);
    return { id: r.rows[0].id as string };
  }),

  // Só cancela o que ainda está PENDING — depois de aprovado, a mudança
  // passa pelo admin (mantém o registro de auditoria da decisão original).
  cancelMySponsorship: sponsorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `DELETE FROM sponsorships WHERE id = $1 AND sponsor_id = $2 AND approval_status = 'PENDING'`,
        [input.id, ctx.sponsorId]);
      if (!r.rowCount) throw new Error("Patrocínio não encontrado ou já foi decidido");
      return { ok: true };
    }),

  addSocialLink: sponsorProcedure
    .input(z.object({ platform: z.enum(SOCIAL_PLATFORMS), url: z.string().trim().url() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.pool.query(`SELECT plan FROM sponsors WHERE id = $1`, [ctx.sponsorId]);
      const max = PLAN_LIMITS[plan.rows[0]?.plan] ?? 1;
      const count = await ctx.pool.query(
        `SELECT count(*)::int AS n FROM sponsor_social_links WHERE sponsor_id = $1`, [ctx.sponsorId]);
      if (count.rows[0].n >= max)
        throw new Error(`Limite do plano atingido (até ${max} rede${max === 1 ? "" : "s"} social`
          + `${max === 1 ? "" : "is"})`);
      await ctx.pool.query(
        `INSERT INTO sponsor_social_links (sponsor_id, platform, url, display_order)
         VALUES ($1,$2,$3,$4)`,
        [ctx.sponsorId, input.platform, input.url, count.rows[0].n]);
      return { ok: true };
    }),

  removeSocialLink: sponsorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.pool.query(
        `DELETE FROM sponsor_social_links WHERE id = $1 AND sponsor_id = $2`,
        [input.id, ctx.sponsorId]);
      return { ok: true };
    }),

  // ---- PÚBLICO: patrocínio ativo agora pra um mercado (card no MarketPage) --
  getActiveForMarket: publicProcedure
    .input(z.object({ marketId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const r = await ctx.pool.query(
        `SELECT sp.id AS sponsorship_id, sp.label, s.id AS sponsor_id, s.name, s.logo_url, s.site_url
           FROM sponsorships sp
           JOIN sponsors s ON s.id = sp.sponsor_id
          WHERE sp.market_id = $1
            AND sp.approval_status = 'APPROVED'
            AND s.is_active = true
            AND now() BETWEEN sp.starts_at AND sp.ends_at
          ORDER BY sp.starts_at DESC
          LIMIT 1`, [input.marketId]);
      if (!r.rowCount) return null;
      const row = r.rows[0];
      const links = await socialLinksBySponsor(ctx.pool, [row.sponsor_id]);
      return {
        sponsorshipId: row.sponsorship_id as string,
        label: row.label as string, sponsorName: row.name as string,
        logoUrl: row.logo_url as string | null, siteUrl: row.site_url as string | null,
        socialLinks: links.get(row.sponsor_id) ?? [],
      };
    }),

  // ---- PÚBLICO: espaços de publicidade da home, por posição ---------------
  // 3 superfícies (migrations/008_home_ad_placement.sql): coluna lateral do
  // carrossel, faixa horizontal abaixo dele, e cards nativos na grade de
  // mercados. Uma query só, agrupada em JS — evita 3 round-trips da home.
  getActiveHome: publicProcedure.query(async ({ ctx }) => {
    // ORDER BY random() em vez de starts_at ASC: cada posição tem um teto de
    // exibição (5/4/2), então mais patrocinadores ativos que isso na mesma
    // posição SEMPRE existirá — a questão é só quem aparece. Ordenar por
    // data antiga excluía pra sempre quem entrou depois (silencioso, sem
    // rodízio nenhum — bug relatado). Aleatório a cada carregamento dá
    // exposição justa pra todo mundo ativo, sem precisar de infra de rodízio
    // com estado (cron, contador de impressão etc.).
    const r = await ctx.pool.query(
      `SELECT sp.id AS sponsorship_id, sp.label, sp.home_placement,
              sp.region_scope, sp.region_uf, sp.region_city,
              s.id AS sponsor_id, s.name, s.logo_url, s.site_url, s.creative_url
         FROM sponsorships sp
         JOIN sponsors s ON s.id = sp.sponsor_id
        WHERE sp.is_home = true
          AND sp.approval_status = 'APPROVED'
          AND s.is_active = true
          AND now() BETWEEN sp.starts_at AND sp.ends_at
        ORDER BY random()`);

    // Região do visitante (autodeclarada, opcional — sem geo-IP). Sponsorship
    // regional só aparece pra quem bate; sem declaração, só vê os nacionais
    // (não dá pra confirmar match, então não arrisca mostrar pro público errado).
    let visitorUf: string | null = null;
    let visitorCity: string | null = null;
    if (ctx.user) {
      const v = await ctx.pool.query(`SELECT region_uf, region_city FROM users WHERE id = $1`, [ctx.user.id]);
      visitorUf = v.rows[0]?.region_uf ?? null;
      visitorCity = v.rows[0]?.region_city ?? null;
    }
    const matchesVisitor = (row: (typeof r.rows)[number]) => {
      if (row.region_scope === "NACIONAL") return true;
      if (!visitorUf || visitorUf !== row.region_uf) return false;
      if (row.region_scope === "ESTADUAL") return true;
      return !!visitorCity && visitorCity.trim().toLowerCase() === (row.region_city as string).trim().toLowerCase();
    };
    const rows = r.rows.filter(matchesVisitor);

    const links = await socialLinksBySponsor(ctx.pool, [...new Set(rows.map((row) => row.sponsor_id))]);
    const toItem = (row: (typeof rows)[number]) => ({
      sponsorshipId: row.sponsorship_id as string,
      label: row.label as string, sponsorName: row.name as string,
      logoUrl: row.logo_url as string | null, siteUrl: row.site_url as string | null,
      creativeUrl: row.creative_url as string | null,
      socialLinks: links.get(row.sponsor_id) ?? [],
    });
    const byPlacement = (p: string) => rows.filter((row) => row.home_placement === p).map(toItem);
    return {
      sidebar: byPlacement("SIDEBAR").slice(0, 5),
      banner: byPlacement("BANNER").slice(0, 4),
      grid: byPlacement("GRID").slice(0, 2),
    };
  }),
});
