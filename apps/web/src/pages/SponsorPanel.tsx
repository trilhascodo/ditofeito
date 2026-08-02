import { useEffect, useState, type FormEvent } from "react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/useAuth";
import { SOCIAL_PLATFORMS, SOCIAL_LABEL, type SocialPlatform } from "../lib/socialIcons";
import { UFS } from "../lib/ufs";

const PLAN_LABEL: Record<string, string> = {
  BASICO: "Básico", PROFISSIONAL: "Profissional", PREMIUM: "Premium",
};

const PLACEMENT_LABEL: Record<string, string> = {
  SIDEBAR: "coluna lateral", BANNER: "faixa horizontal", GRID: "nativo na grade",
};
const PLACEMENT_ORDER = ["BANNER", "GRID", "SIDEBAR"] as const;
// Mesmo mapeamento do backend (sponsor.ts PLAN_ALLOWED_PLACEMENTS) — o
// backend valida de novo, isso aqui só evita oferecer opção que vai falhar.
const PLAN_ALLOWED_PLACEMENTS: Record<string, readonly string[]> = {
  BASICO: ["BANNER"],
  PROFISSIONAL: ["BANNER", "GRID"],
  PREMIUM: ["BANNER", "GRID", "SIDEBAR"],
};

const REGION_SCOPE_LABEL: Record<string, string> = {
  NACIONAL: "nacional", ESTADUAL: "estadual", MUNICIPAL: "municipal",
};
type RegionScope = "NACIONAL" | "ESTADUAL" | "MUNICIPAL";

const APPROVAL_LABEL: Record<string, string> = {
  PENDING: "Em análise", APPROVED: "Aprovado", REJECTED: "Rejeitado",
};

// Mesmo valor de sponsor.ts (backend valida de novo) — só pra estimar o
// preço do período antes de pedir aprovação, não é fonte de verdade.
const PLAN_PRICE_CENTS: Record<string, number> = {
  BASICO: 30_000, PROFISSIONAL: 65_000, PREMIUM: 120_000,
};
function estimatePriceCents(plan: string, startsAt: string, endsAt: string): number | null {
  if (!startsAt || !endsAt) return null;
  const days = (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 86_400_000;
  if (!(days > 0)) return null;
  return Math.round(((PLAN_PRICE_CENTS[plan] ?? PLAN_PRICE_CENTS.BASICO) / 30) * days);
}

const fmtBRL = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const LEDGER_REASON_LABEL: Record<string, string> = {
  TOPUP: "Recarga", CAMPAIGN_CHARGE: "Cobrança de campanha", REFUND: "Estorno", ADMIN_ADJUST: "Ajuste manual",
};

function dtLocal(iso: string | Date): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const dtDisplay = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
function fmtPeriod(iso: string | Date): string {
  return dtDisplay.format(new Date(iso));
}

const fmtInt = (n: number) => n.toLocaleString("pt-BR");

function Desempenho() {
  const { data: stats } = trpc.sponsor.myStats.useQuery();

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 4px" }}>Desempenho</h2>
      <p className="hint-text" style={{ marginBottom: 12 }}>
        Impressões (card renderizado) e cliques nos últimos 30 dias, por patrocínio vigente.
      </p>
      {!stats || stats.length === 0 ? (
        <p className="hint-text">
          Sem dados ainda — só aparece aqui depois que um patrocínio for aprovado e começar a rodar.
        </p>
      ) : (
        stats.map((row) => {
          const ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
          return (
            <div key={row.sponsorshipId} className="admin-row">
              <span className="titulo">
                {row.isHome
                  ? `Espaço da home (${PLACEMENT_LABEL[row.homePlacement ?? ""] ?? row.homePlacement})`
                  : row.marketTitle ?? "mercado removido"}
                {row.label && <div className="meta">"{row.label}"</div>}
              </span>
              <span className="mono hint-text">{fmtInt(row.impressions)} impr.</span>
              <span className="mono hint-text">{fmtInt(row.uniqueImpressions)} únicas</span>
              <span className="mono hint-text">{fmtInt(row.clicks)} cliques</span>
              <span className="badge">CTR {ctr.toFixed(1)}%</span>
            </div>
          );
        })
      )}
    </div>
  );
}

function Saldo() {
  const utils = trpc.useUtils();
  const { data: balance } = trpc.sponsor.myBalance.useQuery(undefined, {
    // Enquanto tiver Pix/boleto em aberto, atualiza sozinho — quando o
    // webhook confirmar o pagamento, a tela reflete sem precisar F5.
    refetchInterval: (query) => (query.state.data?.pendingPayments.length ? 5_000 : false),
  });
  const createTopup = trpc.sponsor.createTopup.useMutation();

  const [amount, setAmount] = useState("100");
  const [method, setMethod] = useState<"PIX" | "BOLETO">("PIX");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastResult, setLastResult] = useState<{ qrCode: string | null; qrCodeBase64: string | null; boletoUrl: string | null } | null>(null);

  async function onTopup(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const amountCents = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!(amountCents >= 5_000)) { setErr("Valor mínimo: R$ 50,00"); return; }
    try {
      const r = await createTopup.mutateAsync({ amountCents, method });
      setLastResult(r);
      await utils.sponsor.myBalance.invalidate();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Erro ao gerar cobrança");
    }
  }

  async function onCopyQr(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 4px" }}>Saldo</h2>
      <p className="hint-text" style={{ marginBottom: 12 }}>
        Recarregue via Pix ou boleto — a campanha só é aprovada quando o saldo cobre o período pedido.
      </p>
      <div className="mono" style={{ fontSize: 28, fontWeight: 600, color: "var(--violeta)", marginBottom: 16 }}>
        {fmtBRL(balance?.balanceCents ?? 0)}
      </div>

      {balance?.pendingPayments.map((p) => (
        <div key={p.id} className="admin-row" style={{ marginBottom: 10 }}>
          <span className="titulo">
            {p.method === "PIX" ? "Pix" : "Boleto"} aguardando pagamento
            <div className="meta">{fmtBRL(p.amountCents)}</div>
          </span>
          {p.method === "PIX" && p.qrCode && (
            <button type="button" className="btn-outline" style={{ width: "auto", padding: "8px 14px" }} onClick={() => onCopyQr(p.qrCode!)}>
              {copied ? "Copiado!" : "Copiar código Pix"}
            </button>
          )}
          {p.method === "BOLETO" && p.boletoUrl && (
            <a className="btn-outline" style={{ width: "auto", padding: "8px 14px" }} href={p.boletoUrl} target="_blank" rel="noopener noreferrer">
              Ver boleto
            </a>
          )}
        </div>
      ))}

      {lastResult?.qrCodeBase64 && (
        <div style={{ textAlign: "center", margin: "12px 0" }}>
          <img
            src={`data:image/png;base64,${lastResult.qrCodeBase64}`} alt="QR code Pix"
            style={{ width: 200, height: 200 }}
          />
        </div>
      )}

      <form onSubmit={onTopup} style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "0 1 160px", marginBottom: 0 }}>
          <label className="label" htmlFor="topup-amount">Valor (R$)</label>
          <input className="input" id="topup-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field" style={{ flex: "0 1 160px", marginBottom: 0 }}>
          <label className="label" htmlFor="topup-method">Forma</label>
          <select id="topup-method" value={method} onChange={(e) => setMethod(e.target.value as "PIX" | "BOLETO")}>
            <option value="PIX">Pix</option>
            <option value="BOLETO">Boleto</option>
          </select>
        </div>
        <button className="btn-outline" style={{ width: "auto", padding: "10px 18px" }} disabled={createTopup.isPending}>
          {createTopup.isPending ? "Gerando…" : "Recarregar"}
        </button>
      </form>
      {err && <p className="error-text" style={{ marginTop: 8 }}>{err}</p>}

      {balance && balance.ledger.length > 0 && (
        <>
          <h3 style={{ fontFamily: "var(--serif)", fontSize: 16, margin: "20px 0 12px" }}>Extrato</h3>
          {balance.ledger.map((l) => (
            <div key={l.id} className="out">
              <span className="nome">
                {LEDGER_REASON_LABEL[l.reason] ?? l.reason}
                <br /><span className="hint-text">{dtDisplay.format(new Date(l.createdAt))}</span>
              </span>
              <span className={`mono ${l.deltaCents >= 0 ? "up" : "down"}`} style={{ textAlign: "right" }}>
                {l.deltaCents >= 0 ? "+" : ""}{fmtBRL(l.deltaCents)}
                <br /><span className="hint-text">saldo {fmtBRL(l.balanceAfterCents)}</span>
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function MinhasCampanhas({ plan }: { plan: string }) {
  const utils = trpc.useUtils();
  const { data: sponsorships } = trpc.sponsor.listMySponsorships.useQuery();
  const { data: markets } = trpc.market.list.useQuery({ status: "OPEN" });
  const requestSponsorship = trpc.sponsor.requestSponsorship.useMutation();
  const cancelSponsorship = trpc.sponsor.cancelMySponsorship.useMutation();

  const [marketId, setMarketId] = useState("");
  const [isHome, setIsHome] = useState(false);
  const [homePlacement, setHomePlacement] = useState("");
  const [regionScope, setRegionScope] = useState<RegionScope>("NACIONAL");
  const [regionUf, setRegionUf] = useState("");
  const [regionCity, setRegionCity] = useState("");
  const [label, setLabel] = useState("");
  const [startsAt, setStartsAt] = useState(dtLocal(new Date()));
  const [endsAt, setEndsAt] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const allowed = PLAN_ALLOWED_PLACEMENTS[plan] ?? [];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null); setOk(false);
    if ((!marketId && !isHome) || (isHome && !homePlacement) || !endsAt) {
      setErr("Escolha um mercado ou uma posição da home, e a data de fim.");
      return;
    }
    if (isHome && regionScope !== "NACIONAL" && !regionUf) { setErr("Escolha o estado pro escopo regional."); return; }
    if (isHome && regionScope === "MUNICIPAL" && !regionCity.trim()) { setErr("Escolha a cidade pro escopo municipal."); return; }
    try {
      await requestSponsorship.mutateAsync({
        marketId: isHome ? undefined : marketId, isHome,
        homePlacement: isHome ? (homePlacement as "SIDEBAR" | "BANNER" | "GRID") : undefined,
        regionScope: isHome ? regionScope : undefined,
        regionUf: isHome && regionScope !== "NACIONAL" ? regionUf : undefined,
        regionCity: isHome && regionScope === "MUNICIPAL" ? regionCity.trim() : undefined,
        label: label.trim() || undefined,
        startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(),
      });
      setMarketId(""); setIsHome(false); setHomePlacement("");
      setRegionScope("NACIONAL"); setRegionUf(""); setRegionCity("");
      setLabel(""); setStartsAt(dtLocal(new Date())); setEndsAt("");
      setOk(true);
      await utils.sponsor.listMySponsorships.invalidate();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Erro ao pedir patrocínio");
    }
  }

  async function onCancel(id: string) {
    if (!confirm("Cancelar esse pedido de patrocínio?")) return;
    await cancelSponsorship.mutateAsync({ id });
    await utils.sponsor.listMySponsorships.invalidate();
  }

  const now = Date.now();

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Meus patrocínios</h2>

      {!sponsorships || sponsorships.length === 0 ? (
        <p className="hint-text" style={{ marginBottom: 16 }}>Nenhum patrocínio ainda.</p>
      ) : (
        sponsorships.map((sp) => {
          const starts = new Date(sp.startsAt).getTime();
          const ends = new Date(sp.endsAt).getTime();
          const timeStatus = sp.approvalStatus !== "APPROVED" ? null
            : now < starts ? "AGENDADO" : now < ends ? "VIGENTE" : "EXPIRADO";
          return (
            <div key={sp.id} className="admin-row" style={{ marginBottom: 10 }}>
              <span className="titulo">
                {sp.isHome ? `Espaço da home (${PLACEMENT_LABEL[sp.homePlacement] ?? sp.homePlacement})` : (sp.marketTitle ?? "mercado removido")}
                <div className="meta">
                  {sp.label ? `"${sp.label}" · ` : ""}{fmtPeriod(sp.startsAt)} até {fmtPeriod(sp.endsAt)}
                  {sp.isHome && ` · ${REGION_SCOPE_LABEL[sp.regionScope] ?? sp.regionScope}`}
                </div>
                {sp.approvalStatus === "REJECTED" && sp.adminNote && (
                  <div className="meta" style={{ color: "var(--grafite)" }}>Motivo: {sp.adminNote}</div>
                )}
              </span>
              <span className={`badge ${sp.approvalStatus === "APPROVED" ? "" : "badge-draft"}`}>
                {timeStatus ?? APPROVAL_LABEL[sp.approvalStatus]}
              </span>
              {sp.approvalStatus === "PENDING" && (
                <button
                  className="btn-outline btn-danger" style={{ padding: "8px 14px", fontSize: 13 }}
                  onClick={() => onCancel(sp.id)} disabled={cancelSponsorship.isPending}
                >
                  Cancelar
                </button>
              )}
            </div>
          );
        })
      )}

      <h3 style={{ fontFamily: "var(--serif)", fontSize: 16, margin: "20px 0 12px" }}>Pedir novo patrocínio</h3>
      <p className="hint-text" style={{ marginBottom: 12 }}>
        Fica em análise até um admin aprovar — só aí aparece pro público.
      </p>
      <form onSubmit={onSubmit}>
        <label className="checkbox-row">
          <input type="checkbox" checked={isHome} onChange={(e) => { setIsHome(e.target.checked); setMarketId(""); setHomePlacement(""); }} />
          Espaço de publicidade da home (não vincula a um mercado específico)
        </label>
        {isHome ? (
          <>
            <div className="field">
              <label className="label" htmlFor="my-sp-placement">
                Posição — seu plano ({PLAN_LABEL[plan] ?? plan}) libera: {allowed.map((p) => PLACEMENT_LABEL[p]).join(", ") || "nenhuma"}
              </label>
              <select id="my-sp-placement" value={homePlacement} onChange={(e) => setHomePlacement(e.target.value)} required>
                <option value="">selecione</option>
                {PLACEMENT_ORDER.filter((p) => allowed.includes(p)).map((p) => (
                  <option key={p} value={p}>{PLACEMENT_LABEL[p]}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="my-sp-region-scope">Alcance</label>
              <select
                id="my-sp-region-scope" value={regionScope}
                onChange={(e) => { setRegionScope(e.target.value as RegionScope); setRegionUf(""); setRegionCity(""); }}
              >
                <option value="NACIONAL">Nacional (todo mundo vê)</option>
                <option value="ESTADUAL">Estadual (só quem declarou o estado no perfil)</option>
                <option value="MUNICIPAL">Municipal (só quem declarou estado + cidade no perfil)</option>
              </select>
              <p className="hint-text" style={{ marginTop: 6 }}>
                {regionScope === "NACIONAL"
                  ? "Alcance máximo — ideal pra marca que atende o Brasil todo."
                  : regionScope === "ESTADUAL"
                    ? "Escolha esse alcance se seu negócio atende um estado específico — evita pagar por audiência fora da sua área."
                    : "Escolha esse alcance se seu negócio é local (ex.: comércio de uma cidade) — o espaço custa menos e mira só em quem pode virar cliente de verdade."}
              </p>
              {regionScope !== "NACIONAL" && (
                <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <select value={regionUf} onChange={(e) => setRegionUf(e.target.value)} style={{ flex: "1 1 200px" }} required>
                    <option value="">selecione o estado</option>
                    {UFS.map((uf) => <option key={uf.value} value={uf.value}>{uf.label}</option>)}
                  </select>
                  {regionScope === "MUNICIPAL" && (
                    <input
                      className="input" placeholder="Codó" style={{ flex: "1 1 200px" }}
                      value={regionCity} onChange={(e) => setRegionCity(e.target.value)} required
                    />
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="field">
            <label className="label" htmlFor="my-sp-market">Mercado</label>
            <select id="my-sp-market" value={marketId} onChange={(e) => setMarketId(e.target.value)} required>
              <option value="">selecione</option>
              {markets?.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor="my-sp-label">Rótulo (opcional)</label>
          <input className="input" id="my-sp-label" placeholder="ex.: Apresentado por"
                 value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="my-sp-starts">Começa em</label>
          <input className="input" id="my-sp-starts" type="datetime-local" value={startsAt}
                 onChange={(e) => setStartsAt(e.target.value)} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="my-sp-ends">Termina em</label>
          <input className="input" id="my-sp-ends" type="datetime-local" value={endsAt}
                 onChange={(e) => setEndsAt(e.target.value)} required />
        </div>
        {(() => {
          const price = estimatePriceCents(plan, startsAt, endsAt);
          return price != null && (
            <p className="hint-text" style={{ marginBottom: 12 }}>
              Custo estimado do período: <strong>{fmtBRL(price)}</strong> — debitado do seu
              saldo só quando um admin aprovar o pedido.
            </p>
          );
        })()}
        {err && <p className="error-text">{err}</p>}
        {ok && <p className="hint-text" style={{ color: "var(--conferido)" }}>Pedido enviado — em análise.</p>}
        <button className="btn" style={{ width: "auto" }} disabled={requestSponsorship.isPending}>
          {requestSponsorship.isPending ? "Enviando…" : "Pedir patrocínio"}
        </button>
      </form>
    </div>
  );
}

export function SponsorPanel() {
  const { user, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const { data: mine, isLoading } = trpc.sponsor.getMine.useQuery(undefined, { enabled: user?.role === "SPONSOR" });
  const updateMine = trpc.sponsor.updateMine.useMutation();
  const addSocialLink = trpc.sponsor.addSocialLink.useMutation();
  const removeSocialLink = trpc.sponsor.removeSocialLink.useMutation();

  const [logoUrl, setLogoUrl] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [creativeUrl, setCreativeUrl] = useState("");
  const [taxId, setTaxId] = useState("");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [platform, setPlatform] = useState<SocialPlatform>("INSTAGRAM");
  const [url, setUrl] = useState("");
  const [linkErr, setLinkErr] = useState<string | null>(null);

  useEffect(() => {
    if (!mine) return;
    setLogoUrl(mine.logoUrl ?? "");
    setSiteUrl(mine.siteUrl ?? "");
    setCreativeUrl(mine.creativeUrl ?? "");
    setTaxId(mine.taxId ?? "");
  }, [mine?.logoUrl, mine?.siteUrl, mine?.creativeUrl, mine?.taxId]);

  async function refresh() {
    await utils.sponsor.getMine.invalidate();
  }

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileMsg(null); setProfileErr(null);
    try {
      await updateMine.mutateAsync({
        logoUrl: logoUrl.trim() || undefined, siteUrl: siteUrl.trim() || undefined,
        creativeUrl: creativeUrl.trim() || undefined,
        taxId: taxId.replace(/\D/g, "") || undefined,
      });
      setProfileMsg("Salvo.");
      await refresh();
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  async function onAddLink(e: FormEvent) {
    e.preventDefault();
    setLinkErr(null);
    try {
      await addSocialLink.mutateAsync({ platform, url: url.trim() });
      setUrl("");
      await refresh();
    } catch (err) {
      setLinkErr(err instanceof Error ? err.message : "Erro ao adicionar");
    }
  }

  async function onRemoveLink(id: string) {
    await removeSocialLink.mutateAsync({ id });
    await refresh();
  }

  if (authLoading) return <main className="page-narrow"><p className="hint-text">Carregando…</p></main>;

  if (!user || user.role !== "SPONSOR") {
    return (
      <main className="page-narrow">
        <div className="card">
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Sem permissão</h1>
          <p className="hint-text">Essa área é só pra contas de anunciante vinculadas.</p>
        </div>
      </main>
    );
  }

  if (isLoading || !mine) return <main className="page-narrow"><p className="hint-text">Carregando…</p></main>;

  const atLimite = mine.socialLinks.length >= mine.socialLinksMax;

  return (
    <main className="page-narrow">
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: "0 0 4px" }}>{mine.name}</h1>
        <p className="hint-text">
          Plano {PLAN_LABEL[mine.plan] ?? mine.plan} · {mine.socialLinks.length} de {mine.socialLinksMax} redes sociais usadas
        </p>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Logo, site e arte</h2>
        <form onSubmit={onSaveProfile}>
          <div className="field">
            <label className="label" htmlFor="sponsor-logo">URL do logo</label>
            <input className="input" id="sponsor-logo" type="url" placeholder="https://…"
                   value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="sponsor-site">URL do site</label>
            <input className="input" id="sponsor-site" type="url" placeholder="https://…"
                   value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="sponsor-creative">URL da arte pronta (opcional)</label>
            <input className="input" id="sponsor-creative" type="url" placeholder="https://…"
                   value={creativeUrl} onChange={(e) => setCreativeUrl(e.target.value)} />
            <p className="hint-text" style={{ marginTop: 4 }}>
              Se mandar uma peça finalizada (imagem com fundo, texto e CTA embutidos),
              ela substitui o card logo+nome montado por nós — mas só entra no ar
              depois de revisão editorial (nunca pula a fila, mesmo pra troca).
              Deixar em branco remove a arte na hora, sem revisão.
            </p>
            {mine.creativeReviewStatus === "PENDING" && (
              <p className="hint-text" style={{ marginTop: 4, color: "var(--violeta)" }}>
                Nova arte em revisão — a atual continua no ar até um admin decidir.
              </p>
            )}
            {mine.creativeReviewStatus === "NONE" && !mine.pendingCreativeUrl && mine.creativeAdminNote && (
              <p className="hint-text" style={{ marginTop: 4 }}>
                A última arte enviada não foi aprovada: {mine.creativeAdminNote}
              </p>
            )}
          </div>
          <div className="field">
            <label className="label" htmlFor="sponsor-tax-id">CPF ou CNPJ (opcional)</label>
            <input className="input" id="sponsor-tax-id" placeholder="Só números"
                   value={taxId} onChange={(e) => setTaxId(e.target.value)} />
            <p className="hint-text" style={{ marginTop: 4 }}>
              Exigido pelo Mercado Pago pra gerar Pix/boleto de recarga acima de certo valor —
              pode preencher só quando for recarregar.
            </p>
          </div>
          {profileMsg && <p className="hint-text" style={{ color: "var(--conferido)" }}>{profileMsg}</p>}
          {profileErr && <p className="error-text">{profileErr}</p>}
          <button className="btn" style={{ width: "auto" }} disabled={updateMine.isPending}>
            {updateMine.isPending ? "Salvando…" : "Salvar"}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Redes sociais</h2>
        {mine.socialLinks.length === 0 && <p className="hint-text" style={{ marginBottom: 12 }}>Nenhuma ainda.</p>}
        {mine.socialLinks.map((l) => (
          <div key={l.id} className="admin-row">
            <span className="titulo">
              {SOCIAL_LABEL[l.platform]}
              <div className="meta"><a href={l.url} target="_blank" rel="noopener noreferrer">{l.url}</a></div>
            </span>
            <button
              className="btn-outline btn-danger" style={{ padding: "8px 14px", fontSize: 13 }}
              onClick={() => onRemoveLink(l.id)} disabled={removeSocialLink.isPending}
            >
              Remover
            </button>
          </div>
        ))}
        {atLimite ? (
          <p className="hint-text" style={{ marginTop: 12 }}>
            Limite do plano atingido ({mine.socialLinksMax}). Fale com o DitoFeito pra fazer upgrade.
          </p>
        ) : (
          <form onSubmit={onAddLink} style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select value={platform} onChange={(e) => setPlatform(e.target.value as SocialPlatform)} style={{ flex: "0 1 160px" }}>
              {SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{SOCIAL_LABEL[p]}</option>)}
            </select>
            <input
              className="input" type="url" placeholder="https://…" style={{ flex: "1 1 240px" }}
              value={url} onChange={(e) => setUrl(e.target.value)} required
            />
            <button className="btn-outline" style={{ padding: "10px 16px", width: "auto" }} disabled={addSocialLink.isPending}>
              {addSocialLink.isPending ? "Adicionando…" : "Adicionar"}
            </button>
          </form>
        )}
        {linkErr && <p className="error-text" style={{ marginTop: 8 }}>{linkErr}</p>}
      </div>

      <Saldo />
      <Desempenho />
      <MinhasCampanhas plan={mine.plan} />
    </main>
  );
}
