import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { UFS } from "../lib/ufs";

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

const PLACEMENT_LABEL: Record<string, string> = {
  SIDEBAR: "coluna lateral", BANNER: "faixa horizontal", GRID: "nativo na grade",
};

const PLAN_LABEL: Record<string, string> = {
  BASICO: "Básico", PROFISSIONAL: "Profissional", PREMIUM: "Premium",
};
type Plan = "BASICO" | "PROFISSIONAL" | "PREMIUM";

// Mesmo mapeamento do backend (sponsor.ts PLAN_ALLOWED_PLACEMENTS) —
// cumulativo: plano maior inclui os menores (Premium libera as 3 posições,
// não só a lateral). O <select> abaixo só oferece as posições que o plano
// do sponsor selecionado realmente libera; o backend valida de novo.
const PLACEMENT_ORDER = ["BANNER", "GRID", "SIDEBAR"] as const;
const PLAN_ALLOWED_PLACEMENTS: Record<string, readonly string[]> = {
  BASICO: ["BANNER"],
  PROFISSIONAL: ["BANNER", "GRID"],
  PREMIUM: ["BANNER", "GRID", "SIDEBAR"],
};

const SOCIAL_LABEL: Record<string, string> = {
  INSTAGRAM: "Instagram", X: "X", TIKTOK: "TikTok", YOUTUBE: "YouTube", FACEBOOK: "Facebook", WHATSAPP: "WhatsApp",
};

const REGION_SCOPE_LABEL: Record<string, string> = {
  NACIONAL: "nacional", ESTADUAL: "estadual", MUNICIPAL: "municipal",
};
type RegionScope = "NACIONAL" | "ESTADUAL" | "MUNICIPAL";

export function AdminSponsors() {
  const utils = trpc.useUtils();
  const { data: sponsors } = trpc.sponsor.list.useQuery();
  const { data: sponsorships } = trpc.sponsor.listSponsorships.useQuery(undefined);
  const { data: markets } = trpc.admin.listMarkets.useQuery();
  const { data: adStats } = trpc.adEvents.stats.useQuery({ days: 30 });
  const { data: pendingSponsorships } = trpc.sponsor.listPendingSponsorships.useQuery();

  const createSponsor = trpc.sponsor.create.useMutation();
  const setActive = trpc.sponsor.setActive.useMutation();
  const updateSponsor = trpc.sponsor.update.useMutation();
  const createSponsorship = trpc.sponsor.createSponsorship.useMutation();
  const updateSponsorship = trpc.sponsor.updateSponsorship.useMutation();
  const removeSponsorship = trpc.sponsor.removeSponsorship.useMutation();
  const linkUser = trpc.sponsor.linkUser.useMutation();
  const approveSponsorshipReq = trpc.sponsor.approveSponsorship.useMutation();
  const rejectSponsorshipReq = trpc.sponsor.rejectSponsorship.useMutation();
  const approveCreative = trpc.sponsor.approveCreative.useMutation();
  const rejectCreative = trpc.sponsor.rejectCreative.useMutation();

  const [rejectingSpReqId, setRejectingSpReqId] = useState<string | null>(null);
  const [rejectSpReqNote, setRejectSpReqNote] = useState("");
  const [rejectingCreativeId, setRejectingCreativeId] = useState<string | null>(null);
  const [rejectCreativeNote, setRejectCreativeNote] = useState("");

  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [creativeUrl, setCreativeUrl] = useState("");
  const [plan, setPlan] = useState<Plan>("BASICO");
  const [sponsorErr, setSponsorErr] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState("");
  const [editSiteUrl, setEditSiteUrl] = useState("");
  const [editCreativeUrl, setEditCreativeUrl] = useState("");
  const [editPlan, setEditPlan] = useState<Plan>("BASICO");
  const [editErr, setEditErr] = useState<string | null>(null);

  const [linkSponsorId, setLinkSponsorId] = useState("");
  const [linkHandle, setLinkHandle] = useState("");
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [linkOk, setLinkOk] = useState(false);

  const [editingSpId, setEditingSpId] = useState<string | null>(null);
  const [sponsorId, setSponsorId] = useState("");
  const [marketId, setMarketId] = useState("");
  const [isHome, setIsHome] = useState(false);
  const [homePlacement, setHomePlacement] = useState("");
  const [regionScope, setRegionScope] = useState<RegionScope>("NACIONAL");
  const [regionUf, setRegionUf] = useState("");
  const [regionCity, setRegionCity] = useState("");
  const [label, setLabel] = useState("");
  const [startsAt, setStartsAt] = useState(dtLocal(new Date()));
  const [endsAt, setEndsAt] = useState("");
  const [spErr, setSpErr] = useState<string | null>(null);

  async function refresh() {
    await Promise.all([utils.sponsor.list.invalidate(), utils.sponsor.listSponsorships.invalidate()]);
  }

  async function refreshPendentes() {
    await Promise.all([
      utils.sponsor.listPendingSponsorships.invalidate(),
      utils.sponsor.list.invalidate(),
    ]);
  }

  async function onApproveSponsorshipReq(id: string) {
    await approveSponsorshipReq.mutateAsync({ id });
    await refreshPendentes();
  }
  async function onRejectSponsorshipReq(id: string) {
    if (!rejectSpReqNote.trim()) return;
    await rejectSponsorshipReq.mutateAsync({ id, adminNote: rejectSpReqNote.trim() });
    setRejectingSpReqId(null); setRejectSpReqNote("");
    await refreshPendentes();
  }

  async function onApproveCreative(id: string) {
    await approveCreative.mutateAsync({ id });
    await refreshPendentes();
  }
  async function onRejectCreative(id: string) {
    if (!rejectCreativeNote.trim()) return;
    await rejectCreative.mutateAsync({ id, adminNote: rejectCreativeNote.trim() });
    setRejectingCreativeId(null); setRejectCreativeNote("");
    await refreshPendentes();
  }

  async function onCreateSponsor(e: FormEvent) {
    e.preventDefault();
    setSponsorErr(null);
    try {
      await createSponsor.mutateAsync({
        name: name.trim(), logoUrl: logoUrl.trim() || undefined, siteUrl: siteUrl.trim() || undefined,
        creativeUrl: creativeUrl.trim() || undefined, plan,
      });
      setName(""); setLogoUrl(""); setSiteUrl(""); setCreativeUrl(""); setPlan("BASICO");
      await refresh();
    } catch (err) {
      setSponsorErr(err instanceof Error ? err.message : "Erro ao criar patrocinador");
    }
  }

  async function onToggleActive(id: string, isActive: boolean) {
    await setActive.mutateAsync({ id, isActive: !isActive });
    await refresh();
  }

  function onStartEdit(s: { id: string; name: string; logoUrl: string | null; siteUrl: string | null; creativeUrl: string | null; plan: string }) {
    setEditingId(s.id); setEditName(s.name); setEditLogoUrl(s.logoUrl ?? ""); setEditSiteUrl(s.siteUrl ?? "");
    setEditCreativeUrl(s.creativeUrl ?? ""); setEditPlan(s.plan as Plan); setEditErr(null);
  }

  function onCancelEdit() {
    setEditingId(null); setEditErr(null);
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditErr(null);
    try {
      await updateSponsor.mutateAsync({
        id: editingId, name: editName.trim(),
        logoUrl: editLogoUrl.trim() || undefined, siteUrl: editSiteUrl.trim() || undefined,
        creativeUrl: editCreativeUrl.trim() || undefined,
        plan: editPlan,
      });
      setEditingId(null);
      await refresh();
    } catch (err) {
      setEditErr(err instanceof Error ? err.message : "Erro ao salvar patrocinador");
    }
  }

  async function onCreateSponsorship(e: FormEvent) {
    e.preventDefault();
    setSpErr(null);
    if (!sponsorId || (!marketId && !isHome) || (isHome && !homePlacement) || !endsAt) {
      setSpErr("Preencha patrocinador, data de fim, e um mercado ou uma posição da home.");
      return;
    }
    if (isHome && regionScope !== "NACIONAL" && !regionUf) {
      setSpErr("Escolha o estado pro escopo regional.");
      return;
    }
    if (isHome && regionScope === "MUNICIPAL" && !regionCity.trim()) {
      setSpErr("Escolha a cidade pro escopo municipal.");
      return;
    }
    const payload = {
      sponsorId, marketId: isHome ? undefined : marketId, isHome,
      homePlacement: isHome ? (homePlacement as "SIDEBAR" | "BANNER" | "GRID") : undefined,
      regionScope: isHome ? regionScope : undefined,
      regionUf: isHome && regionScope !== "NACIONAL" ? regionUf : undefined,
      regionCity: isHome && regionScope === "MUNICIPAL" ? regionCity.trim() : undefined,
      label: label.trim() || undefined,
      startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(),
    };
    try {
      if (editingSpId) {
        await updateSponsorship.mutateAsync({ id: editingSpId, ...payload });
      } else {
        await createSponsorship.mutateAsync(payload);
      }
      onCancelEditSponsorship();
      await refresh();
    } catch (err) {
      setSpErr(err instanceof Error ? err.message : "Erro ao salvar patrocínio");
    }
  }

  function onStartEditSponsorship(sp: NonNullable<typeof sponsorships>[number]) {
    setEditingSpId(sp.id);
    setSponsorId(sp.sponsor.id);
    setMarketId(sp.marketId ?? "");
    setIsHome(sp.isHome);
    setHomePlacement(sp.isHome ? sp.homePlacement : "");
    setRegionScope(sp.regionScope);
    setRegionUf(sp.regionUf ?? "");
    setRegionCity(sp.regionCity ?? "");
    setLabel(sp.label);
    setStartsAt(dtLocal(sp.startsAt));
    setEndsAt(dtLocal(sp.endsAt));
    setSpErr(null);
    document.getElementById("sp-sponsor")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function onCancelEditSponsorship() {
    setEditingSpId(null);
    setSponsorId(""); setMarketId(""); setIsHome(false); setHomePlacement("");
    setRegionScope("NACIONAL"); setRegionUf(""); setRegionCity("");
    setLabel(""); setStartsAt(dtLocal(new Date())); setEndsAt("");
    setSpErr(null);
  }

  async function onRemoveSponsorship(id: string) {
    if (!confirm("Remover esse patrocínio?")) return;
    await removeSponsorship.mutateAsync({ id });
    if (editingSpId === id) onCancelEditSponsorship();
    await refresh();
  }

  async function onLinkUser(e: FormEvent) {
    e.preventDefault();
    setLinkErr(null); setLinkOk(false);
    if (!linkSponsorId || !linkHandle.trim()) {
      setLinkErr("Escolha o patrocinador e o nome de usuário da conta.");
      return;
    }
    try {
      await linkUser.mutateAsync({ sponsorId: linkSponsorId, handle: linkHandle.trim() });
      setLinkOk(true); setLinkHandle("");
    } catch (err) {
      setLinkErr(err instanceof Error ? err.message : "Erro ao vincular");
    }
  }

  const now = Date.now();

  return (
    <div>
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: 0 }}>Patrocinadores</h1>
      </div>

      {(() => {
        const pendingCreatives = sponsors?.filter((s) => s.creativeReviewStatus === "PENDING") ?? [];
        return (
          <>
            <div className="card" style={{ marginTop: 20 }}>
              <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>
                Patrocínios pendentes {(pendingSponsorships?.length ?? 0) > 0 && (
                  <span className="badge" style={{ marginLeft: 6 }}>{pendingSponsorships?.length}</span>
                )}
              </h2>
              <p className="hint-text" style={{ marginBottom: 12 }}>
                Campanha pedida em autoatendimento (/patrocinador) — só fica visível pro
                público depois de aprovada aqui.
              </p>
              {!pendingSponsorships || pendingSponsorships.length === 0 ? (
                <p className="hint-text">Nenhum patrocínio pendente.</p>
              ) : (
                pendingSponsorships.map((sp) => (
                  <div key={sp.id} className="admin-row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                    <span className="titulo">
                      {sp.sponsor.name} → {sp.isHome
                        ? `Espaço da home (${PLACEMENT_LABEL[sp.homePlacement] ?? sp.homePlacement})`
                        : sp.marketSlug ? <Link to={`/admin/mercados/${sp.marketSlug}`}>{sp.marketTitle}</Link> : "mercado removido"}
                      <div className="meta">
                        {sp.label ? `"${sp.label}" · ` : ""}{fmtPeriod(sp.startsAt)} até {fmtPeriod(sp.endsAt)}
                        {sp.isHome && ` · ${REGION_SCOPE_LABEL[sp.regionScope] ?? sp.regionScope}`}
                      </div>
                    </span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="btn-outline" style={{ padding: "8px 14px", fontSize: 13 }}
                        onClick={() => onApproveSponsorshipReq(sp.id)} disabled={approveSponsorshipReq.isPending}
                      >
                        Aprovar
                      </button>
                      {rejectingSpReqId === sp.id ? (
                        <div style={{ display: "flex", gap: 6, flexBasis: "100%" }}>
                          <input
                            className="input" placeholder="Motivo da rejeição" value={rejectSpReqNote}
                            onChange={(e) => setRejectSpReqNote(e.target.value)} style={{ flex: 1 }}
                          />
                          <button
                            className="btn-outline btn-danger" style={{ padding: "8px 14px", fontSize: 13, width: "auto" }}
                            onClick={() => onRejectSponsorshipReq(sp.id)} disabled={rejectSponsorshipReq.isPending || !rejectSpReqNote.trim()}
                          >
                            Confirmar
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn-outline btn-danger" style={{ padding: "8px 14px", fontSize: 13 }}
                          onClick={() => { setRejectingSpReqId(sp.id); setRejectSpReqNote(""); }}
                        >
                          Rejeitar
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="card" style={{ marginTop: 20 }}>
              <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>
                Arte pendente {pendingCreatives.length > 0 && <span className="badge" style={{ marginLeft: 6 }}>{pendingCreatives.length}</span>}
              </h2>
              <p className="hint-text" style={{ marginBottom: 12 }}>
                Arte enviada pelo próprio anunciante em /patrocinador — a arte anterior (se
                houver) continua no ar até você decidir. Checagem manual: nunca publicidade
                de candidato, partido, coligação ou comitê financeiro (Metodologia §7).
              </p>
              {pendingCreatives.length === 0 ? (
                <p className="hint-text">Nenhuma arte pendente.</p>
              ) : (
                pendingCreatives.map((s) => (
                  <div key={s.id} className="admin-row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                    {s.pendingCreativeUrl && (
                      <img src={s.pendingCreativeUrl} alt="arte pendente" style={{ height: 64, width: "auto", maxWidth: 90, objectFit: "cover", borderRadius: 6, flex: "none" }} />
                    )}
                    <span className="titulo">
                      {s.name}
                      <div className="meta">Plano {PLAN_LABEL[s.plan] ?? s.plan}</div>
                    </span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="btn-outline" style={{ padding: "8px 14px", fontSize: 13 }}
                        onClick={() => onApproveCreative(s.id)} disabled={approveCreative.isPending}
                      >
                        Aprovar
                      </button>
                      {rejectingCreativeId === s.id ? (
                        <div style={{ display: "flex", gap: 6, flexBasis: "100%" }}>
                          <input
                            className="input" placeholder="Motivo da rejeição" value={rejectCreativeNote}
                            onChange={(e) => setRejectCreativeNote(e.target.value)} style={{ flex: 1 }}
                          />
                          <button
                            className="btn-outline btn-danger" style={{ padding: "8px 14px", fontSize: 13, width: "auto" }}
                            onClick={() => onRejectCreative(s.id)} disabled={rejectCreative.isPending || !rejectCreativeNote.trim()}
                          >
                            Confirmar
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn-outline btn-danger" style={{ padding: "8px 14px", fontSize: 13 }}
                          onClick={() => { setRejectingCreativeId(s.id); setRejectCreativeNote(""); }}
                        >
                          Rejeitar
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        );
      })()}

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Novo patrocinador</h2>
        <form onSubmit={onCreateSponsor}>
          <div className="field">
            <label className="label" htmlFor="sp-name">Nome</label>
            <input className="input" id="sp-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label" htmlFor="sp-logo">URL do logo (opcional)</label>
            <input className="input" id="sp-logo" type="url" placeholder="https://…"
                   value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="sp-site">URL do site (opcional)</label>
            <input className="input" id="sp-site" type="url" placeholder="https://…"
                   value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="sp-creative">URL da arte pronta (opcional)</label>
            <input className="input" id="sp-creative" type="url" placeholder="https://…"
                   value={creativeUrl} onChange={(e) => setCreativeUrl(e.target.value)} />
            <p className="hint-text" style={{ marginTop: 4 }}>
              Se o anunciante mandou a peça já finalizada (imagem com fundo,
              texto e CTA embutidos), cole a URL aqui — ela substitui o card
              logo+nome montado por nós na coluna lateral da home.
            </p>
          </div>
          <div className="field">
            <label className="label" htmlFor="sp-plan">Plano</label>
            <select id="sp-plan" value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>
              <option value="BASICO">Básico (até 1 rede social)</option>
              <option value="PROFISSIONAL">Profissional (até 3 redes sociais)</option>
              <option value="PREMIUM">Premium (até 5 redes sociais)</option>
            </select>
          </div>
          {sponsorErr && <p className="error-text">{sponsorErr}</p>}
          <button className="btn" style={{ width: "auto" }} disabled={createSponsor.isPending}>
            {createSponsor.isPending ? "Criando…" : "Criar patrocinador"}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Patrocinadores cadastrados</h2>
        {!sponsors || sponsors.length === 0 ? (
          <p className="hint-text">Nenhum patrocinador ainda.</p>
        ) : (
          sponsors.map((s) =>
            editingId === s.id ? (
              <form key={s.id} onSubmit={onSaveEdit} className="admin-row" style={{ flexWrap: "wrap" }}>
                <div className="field" style={{ flex: "1 1 160px", marginBottom: 0 }}>
                  <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} required placeholder="Nome" />
                </div>
                <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
                  <input className="input" type="url" value={editLogoUrl} onChange={(e) => setEditLogoUrl(e.target.value)} placeholder="URL do logo" />
                </div>
                <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
                  <input className="input" type="url" value={editSiteUrl} onChange={(e) => setEditSiteUrl(e.target.value)} placeholder="URL do site" />
                </div>
                <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
                  <input className="input" type="url" value={editCreativeUrl} onChange={(e) => setEditCreativeUrl(e.target.value)} placeholder="URL da arte pronta" />
                </div>
                <div className="field" style={{ flex: "1 1 160px", marginBottom: 0 }}>
                  <select value={editPlan} onChange={(e) => setEditPlan(e.target.value as Plan)}>
                    <option value="BASICO">Básico</option>
                    <option value="PROFISSIONAL">Profissional</option>
                    <option value="PREMIUM">Premium</option>
                  </select>
                </div>
                {editErr && <p className="error-text" style={{ flexBasis: "100%" }}>{editErr}</p>}
                <button className="btn-outline" style={{ padding: "8px 14px", fontSize: 13, width: "auto" }} disabled={updateSponsor.isPending}>
                  {updateSponsor.isPending ? "Salvando…" : "Salvar"}
                </button>
                <button type="button" className="link-btn" onClick={onCancelEdit}>Cancelar</button>
              </form>
            ) : (
              <div key={s.id} className="admin-row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                {s.logoUrl ? (
                  <img src={s.logoUrl} alt="" style={{ height: 32, width: "auto", maxWidth: 60, objectFit: "contain", flex: "none" }} />
                ) : (
                  <span className="hint-text" style={{ flex: "none", width: 60, fontSize: 11 }}>sem logo</span>
                )}
                <span className="titulo">
                  {s.name}
                  <div className="meta">
                    {s.siteUrl ? <a href={s.siteUrl} target="_blank" rel="noopener noreferrer">{s.siteUrl}</a> : "sem site cadastrado"}
                    {" · "}{PLAN_LABEL[s.plan] ?? s.plan}
                    {" · libera: "}{(PLAN_ALLOWED_PLACEMENTS[s.plan] ?? []).map((p) => PLACEMENT_LABEL[p]).join(", ")}
                    {s.creativeUrl && " · tem arte pronta"}
                  </div>
                  {s.socialLinks.length > 0 && (
                    <div className="meta">
                      {s.socialLinks.map((l) => (
                        <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" style={{ marginRight: 8 }}>
                          {SOCIAL_LABEL[l.platform] ?? l.platform}
                        </a>
                      ))}
                    </div>
                  )}
                </span>
                {s.creativeUrl && (
                  <img src={s.creativeUrl} alt="arte pronta" style={{ height: 48, width: "auto", maxWidth: 60, objectFit: "cover", borderRadius: 6, flex: "none" }} />
                )}
                <span className={`badge ${s.isActive ? "" : "badge-draft"}`}>{s.isActive ? "ATIVO" : "INATIVO"}</span>
                <button
                  className="btn-outline" style={{ padding: "8px 14px", fontSize: 13, width: "auto" }}
                  onClick={() => onStartEdit(s)}
                >
                  Editar
                </button>
                <button
                  className="btn-outline" style={{ padding: "8px 14px", fontSize: 13, width: "auto" }}
                  onClick={() => onToggleActive(s.id, s.isActive)} disabled={setActive.isPending}
                >
                  {s.isActive ? "Desativar" : "Ativar"}
                </button>
              </div>
            ),
          )
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Vincular conta de anunciante</h2>
        <p className="hint-text" style={{ marginBottom: 12 }}>
          O anunciante precisa ter uma conta normal no site primeiro (cadastro
          comum). Vincular libera o painel dele em /patrocinador pra editar
          logo, site e redes sociais, dentro do limite do plano.
        </p>
        <form onSubmit={onLinkUser}>
          <div className="field">
            <label className="label" htmlFor="link-sponsor">Patrocinador</label>
            <select id="link-sponsor" value={linkSponsorId} onChange={(e) => setLinkSponsorId(e.target.value)} required>
              <option value="">selecione</option>
              {sponsors?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="link-handle">Nome de usuário da conta</label>
            <input className="input" id="link-handle" value={linkHandle} onChange={(e) => setLinkHandle(e.target.value)} required />
          </div>
          {linkErr && <p className="error-text">{linkErr}</p>}
          {linkOk && <p className="hint-text" style={{ color: "var(--conferido)" }}>Vinculado.</p>}
          <button className="btn" style={{ width: "auto" }} disabled={linkUser.isPending}>
            {linkUser.isPending ? "Vinculando…" : "Vincular"}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>
          {editingSpId ? "Editar patrocínio" : "Novo patrocínio"}
        </h2>
        <p className="hint-text" style={{ marginBottom: 12 }}>
          Vincula um patrocinador a um mercado (card "Apresentado por" na página do
          mercado e tag no card da home) ou a uma posição da home — o plano contratado
          libera um conjunto de posições, cumulativo (Básico = faixa; Profissional =
          faixa + grade; Premium = faixa + grade + lateral), mesmo mapeamento da
          página /anuncie.
        </p>
        <form onSubmit={onCreateSponsorship}>
          <div className="field">
            <label className="label" htmlFor="sp-sponsor">Patrocinador</label>
            <select id="sp-sponsor" value={sponsorId} onChange={(e) => setSponsorId(e.target.value)} required>
              <option value="">selecione</option>
              {sponsors?.map((s) => <option key={s.id} value={s.id}>{s.name} ({PLAN_LABEL[s.plan] ?? s.plan})</option>)}
            </select>
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={isHome} onChange={(e) => { setIsHome(e.target.checked); setMarketId(""); setHomePlacement(""); }} />
            Espaço de publicidade da home (não vincula a um mercado específico)
          </label>
          {isHome && (() => {
            const plan = sponsors?.find((s) => s.id === sponsorId)?.plan;
            const allowed = plan ? (PLAN_ALLOWED_PLACEMENTS[plan] ?? []) : [];
            if (!sponsorId) return <p className="hint-text" style={{ marginBottom: 14 }}>Selecione o patrocinador pra ver as posições liberadas.</p>;
            return (
              <div className="field">
                <label className="label" htmlFor="sp-placement">
                  Posição — plano {PLAN_LABEL[plan ?? ""] ?? "?"} libera: {allowed.map((p) => PLACEMENT_LABEL[p]).join(", ")}
                </label>
                <select id="sp-placement" value={homePlacement} onChange={(e) => setHomePlacement(e.target.value)} required>
                  <option value="">selecione</option>
                  {PLACEMENT_ORDER.filter((p) => allowed.includes(p)).map((p) => (
                    <option key={p} value={p}>{PLACEMENT_LABEL[p]}</option>
                  ))}
                </select>
              </div>
            );
          })()}
          {isHome && (
            <div className="field">
              <label className="label" htmlFor="sp-region-scope">Alcance</label>
              <select
                id="sp-region-scope" value={regionScope}
                onChange={(e) => { setRegionScope(e.target.value as RegionScope); setRegionUf(""); setRegionCity(""); }}
              >
                <option value="NACIONAL">Nacional (todo mundo vê)</option>
                <option value="ESTADUAL">Estadual (só quem declarou o estado no perfil)</option>
                <option value="MUNICIPAL">Municipal (só quem declarou estado + cidade no perfil)</option>
              </select>
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
              <p className="hint-text" style={{ marginTop: 6 }}>
                Quem não declarou região no perfil só vê patrocínio nacional — evita mostrar pro público errado.
              </p>
            </div>
          )}
          {!isHome && (
            <div className="field">
              <label className="label" htmlFor="sp-market">Mercado</label>
              <select id="sp-market" value={marketId} onChange={(e) => setMarketId(e.target.value)} required>
                <option value="">selecione</option>
                {markets?.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label className="label" htmlFor="sp-label">Rótulo (opcional)</label>
            <input className="input" id="sp-label" placeholder="ex.: Apresentado por"
                   value={label} onChange={(e) => setLabel(e.target.value)} />
            <p className="hint-text" style={{ marginTop: 4 }}>Em branco não mostra rótulo nenhum.</p>
          </div>
          <div className="field">
            <label className="label" htmlFor="sp-starts">Começa em</label>
            <input className="input" id="sp-starts" type="datetime-local" value={startsAt}
                   onChange={(e) => setStartsAt(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label" htmlFor="sp-ends">Termina em</label>
            <input className="input" id="sp-ends" type="datetime-local" value={endsAt}
                   onChange={(e) => setEndsAt(e.target.value)} required />
          </div>
          {spErr && <p className="error-text">{spErr}</p>}
          <button className="btn" style={{ width: "auto" }} disabled={createSponsorship.isPending || updateSponsorship.isPending}>
            {editingSpId
              ? (updateSponsorship.isPending ? "Salvando…" : "Salvar edição")
              : (createSponsorship.isPending ? "Criando…" : "Criar patrocínio")}
          </button>
          {editingSpId && (
            <button type="button" className="link-btn" onClick={onCancelEditSponsorship} style={{ marginLeft: 12 }}>
              Cancelar edição
            </button>
          )}
        </form>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Patrocínios</h2>
        {!sponsorships || sponsorships.length === 0 ? (
          <p className="hint-text">Nenhum patrocínio cadastrado.</p>
        ) : (
          // Vigente e agendado primeiro (o que ainda importa pra operação),
          // expirado por último — sem isso a lista vira uma pilha cronológica
          // que mistura o que tá rodando com histórico morto.
          [...sponsorships]
            .sort((a, b) => {
              const rank = (sp: (typeof sponsorships)[number]) => (now < new Date(sp.endsAt).getTime() ? 0 : 1);
              return rank(a) - rank(b) || new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime();
            })
            .map((sp) => {
            const starts = new Date(sp.startsAt).getTime();
            const ends = new Date(sp.endsAt).getTime();
            const status = now < starts ? "AGENDADO" : now < ends ? "VIGENTE" : "EXPIRADO";
            return (
              <div key={sp.id} className="admin-row">
                <span className="titulo">
                  {sp.sponsor.name} → {sp.isHome
                    ? `Espaço da home (${PLACEMENT_LABEL[sp.homePlacement] ?? sp.homePlacement})`
                    : sp.marketSlug ? <Link to={`/admin/mercados/${sp.marketSlug}`}>{sp.marketTitle}</Link> : "mercado removido"}
                  <div className="meta">
                    {sp.label ? `"${sp.label}" · ` : ""}{fmtPeriod(sp.startsAt)} até {fmtPeriod(sp.endsAt)}
                    {sp.isHome && (
                      <>
                        {" · "}{REGION_SCOPE_LABEL[sp.regionScope] ?? sp.regionScope}
                        {sp.regionUf && ` (${sp.regionCity ? `${sp.regionCity}/` : ""}${sp.regionUf})`}
                      </>
                    )}
                  </div>
                </span>
                <span className={`badge ${status === "VIGENTE" ? "" : "badge-draft"}`}>{status}</span>
                <button
                  className="btn-outline" style={{ padding: "8px 14px", fontSize: 13 }}
                  onClick={() => onStartEditSponsorship(sp)}
                >
                  Editar
                </button>
                <button
                  className="btn-outline btn-danger" style={{ padding: "8px 14px", fontSize: 13 }}
                  onClick={() => onRemoveSponsorship(sp.id)} disabled={removeSponsorship.isPending}
                >
                  Remover
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 4px" }}>Desempenho dos anúncios</h2>
        <p className="hint-text" style={{ marginBottom: 12 }}>
          Impressões (card renderizado) e cliques nos últimos 30 dias, por patrocínio vigente —
          base pra negociar espaço e justificar preço.
        </p>
        {!adStats || adStats.length === 0 ? (
          <p className="hint-text">Sem dados ainda.</p>
        ) : (
          adStats.map((row) => {
            const ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
            return (
              <div key={row.sponsorshipId} className="admin-row">
                <span className="titulo">
                  {row.sponsorName}
                  <div className="meta">
                    {row.isHome
                      ? `Espaço da home (${PLACEMENT_LABEL[row.homePlacement ?? ""] ?? row.homePlacement})`
                      : row.marketTitle ?? "mercado removido"}
                    {row.label && <>{" · \""}{row.label}{"\""}</>}
                  </div>
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
    </div>
  );
}
