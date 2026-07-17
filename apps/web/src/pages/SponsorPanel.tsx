import { useEffect, useState, type FormEvent } from "react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/useAuth";
import { SOCIAL_PLATFORMS, SOCIAL_LABEL, type SocialPlatform } from "../lib/socialIcons";

const PLAN_LABEL: Record<string, string> = {
  BASICO: "Básico", PROFISSIONAL: "Profissional", PREMIUM: "Premium",
};

export function SponsorPanel() {
  const { user, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const { data: mine, isLoading } = trpc.sponsor.getMine.useQuery(undefined, { enabled: user?.role === "SPONSOR" });
  const updateMine = trpc.sponsor.updateMine.useMutation();
  const addSocialLink = trpc.sponsor.addSocialLink.useMutation();
  const removeSocialLink = trpc.sponsor.removeSocialLink.useMutation();

  const [logoUrl, setLogoUrl] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [platform, setPlatform] = useState<SocialPlatform>("INSTAGRAM");
  const [url, setUrl] = useState("");
  const [linkErr, setLinkErr] = useState<string | null>(null);

  useEffect(() => {
    if (!mine) return;
    setLogoUrl(mine.logoUrl ?? "");
    setSiteUrl(mine.siteUrl ?? "");
  }, [mine?.logoUrl, mine?.siteUrl]);

  async function refresh() {
    await utils.sponsor.getMine.invalidate();
  }

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileMsg(null); setProfileErr(null);
    try {
      await updateMine.mutateAsync({ logoUrl: logoUrl.trim() || undefined, siteUrl: siteUrl.trim() || undefined });
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
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Logo e site</h2>
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
    </main>
  );
}
