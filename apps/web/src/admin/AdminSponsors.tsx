import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";

function dtLocal(iso: string | Date): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const dtDisplay = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
function fmtPeriod(iso: string | Date): string {
  return dtDisplay.format(new Date(iso));
}

export function AdminSponsors() {
  const utils = trpc.useUtils();
  const { data: sponsors } = trpc.sponsor.list.useQuery();
  const { data: sponsorships } = trpc.sponsor.listSponsorships.useQuery(undefined);
  const { data: markets } = trpc.admin.listMarkets.useQuery();

  const createSponsor = trpc.sponsor.create.useMutation();
  const setActive = trpc.sponsor.setActive.useMutation();
  const createSponsorship = trpc.sponsor.createSponsorship.useMutation();
  const removeSponsorship = trpc.sponsor.removeSponsorship.useMutation();

  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [sponsorErr, setSponsorErr] = useState<string | null>(null);

  const [sponsorId, setSponsorId] = useState("");
  const [marketId, setMarketId] = useState("");
  const [isHome, setIsHome] = useState(false);
  const [label, setLabel] = useState("Apresentado por");
  const [startsAt, setStartsAt] = useState(dtLocal(new Date()));
  const [endsAt, setEndsAt] = useState("");
  const [spErr, setSpErr] = useState<string | null>(null);

  async function refresh() {
    await Promise.all([utils.sponsor.list.invalidate(), utils.sponsor.listSponsorships.invalidate()]);
  }

  async function onCreateSponsor(e: FormEvent) {
    e.preventDefault();
    setSponsorErr(null);
    try {
      await createSponsor.mutateAsync({
        name: name.trim(), logoUrl: logoUrl.trim() || undefined, siteUrl: siteUrl.trim() || undefined,
      });
      setName(""); setLogoUrl(""); setSiteUrl("");
      await refresh();
    } catch (err) {
      setSponsorErr(err instanceof Error ? err.message : "Erro ao criar patrocinador");
    }
  }

  async function onToggleActive(id: string, isActive: boolean) {
    await setActive.mutateAsync({ id, isActive: !isActive });
    await refresh();
  }

  async function onCreateSponsorship(e: FormEvent) {
    e.preventDefault();
    setSpErr(null);
    if (!sponsorId || (!marketId && !isHome) || !endsAt) {
      setSpErr("Preencha patrocinador, data de fim, e um mercado ou a faixa da home.");
      return;
    }
    try {
      await createSponsorship.mutateAsync({
        sponsorId, marketId: isHome ? undefined : marketId, isHome,
        label: label.trim() || "Apresentado por",
        startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(),
      });
      setMarketId(""); setIsHome(false); setEndsAt("");
      await refresh();
    } catch (err) {
      setSpErr(err instanceof Error ? err.message : "Erro ao criar patrocínio");
    }
  }

  async function onRemoveSponsorship(id: string) {
    if (!confirm("Remover esse patrocínio?")) return;
    await removeSponsorship.mutateAsync({ id });
    await refresh();
  }

  const now = Date.now();

  return (
    <div>
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: 0 }}>Patrocinadores</h1>
      </div>

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
          sponsors.map((s) => (
            <div key={s.id} className="admin-row">
              <span className="titulo">
                {s.name}
                <div className="meta">
                  {s.siteUrl ? <a href={s.siteUrl} target="_blank" rel="noopener noreferrer">{s.siteUrl}</a> : "sem site cadastrado"}
                </div>
              </span>
              <span className={`badge ${s.isActive ? "" : "badge-draft"}`}>{s.isActive ? "ATIVO" : "INATIVO"}</span>
              <button
                className="btn-outline" style={{ padding: "8px 14px", fontSize: 13, width: "auto" }}
                onClick={() => onToggleActive(s.id, s.isActive)} disabled={setActive.isPending}
              >
                {s.isActive ? "Desativar" : "Ativar"}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Novo patrocínio</h2>
        <p className="hint-text" style={{ marginBottom: 12 }}>
          Vincula um patrocinador a um mercado (card "Apresentado por" na página do
          mercado e tag no card da home) ou à home inteira (faixa de destaque no
          rodapé da lista de mercados) por um período.
        </p>
        <form onSubmit={onCreateSponsorship}>
          <div className="field">
            <label className="label" htmlFor="sp-sponsor">Patrocinador</label>
            <select id="sp-sponsor" value={sponsorId} onChange={(e) => setSponsorId(e.target.value)} required>
              <option value="">selecione</option>
              {sponsors?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={isHome} onChange={(e) => { setIsHome(e.target.checked); setMarketId(""); }} />
            Faixa de destaque da home (não vincula a um mercado específico)
          </label>
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
            <label className="label" htmlFor="sp-label">Rótulo</label>
            <input className="input" id="sp-label" value={label} onChange={(e) => setLabel(e.target.value)} required />
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
          <button className="btn" style={{ width: "auto" }} disabled={createSponsorship.isPending}>
            {createSponsorship.isPending ? "Criando…" : "Criar patrocínio"}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Patrocínios</h2>
        {!sponsorships || sponsorships.length === 0 ? (
          <p className="hint-text">Nenhum patrocínio cadastrado.</p>
        ) : (
          sponsorships.map((sp) => {
            const active = now >= new Date(sp.startsAt).getTime() && now < new Date(sp.endsAt).getTime();
            return (
              <div key={sp.id} className="admin-row">
                <span className="titulo">
                  {sp.sponsor.name} → {sp.isHome
                    ? "Faixa da home"
                    : sp.marketSlug ? <Link to={`/admin/mercados/${sp.marketSlug}`}>{sp.marketTitle}</Link> : "mercado removido"}
                  <div className="meta">
                    "{sp.label}" · {fmtPeriod(sp.startsAt)} até {fmtPeriod(sp.endsAt)}
                  </div>
                </span>
                <span className={`badge ${active ? "" : "badge-draft"}`}>{active ? "VIGENTE" : "FORA DO PERÍODO"}</span>
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
    </div>
  );
}
