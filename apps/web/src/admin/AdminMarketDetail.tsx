import { useEffect, useState, type FormEvent } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { trpc } from "../lib/trpc";

interface Ctx { role: string }

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "RASCUNHO", OPEN: "ABERTO", CLOSED: "ENCERRADO", RESOLVED: "RESOLVIDO", VOIDED: "ANULADO",
};

function dtLocal(iso: string | Date): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdminMarketDetail() {
  const { slug = "" } = useParams();
  const { role } = useOutletContext<Ctx>();
  const canEdit = role === "ADMIN";
  const utils = trpc.useUtils();
  const { data: market, isLoading, error } = trpc.market.get.useQuery({ slug }, { enabled: !!slug });
  const { data: news } = trpc.news.list.useQuery({ marketId: market?.id ?? "" }, { enabled: !!market });

  const updateMutation = trpc.market.update.useMutation();
  const publishMutation = trpc.market.publish.useMutation();
  const resolveMutation = trpc.admin.resolveMarket.useMutation();
  const voidMutation = trpc.admin.voidMarket.useMutation();
  const addNewsMutation = trpc.news.add.useMutation();
  const removeNewsMutation = trpc.news.remove.useMutation();
  const setFeaturedMutation = trpc.market.setFeatured.useMutation();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resolutionCriteria, setResolutionCriteria] = useState("");
  const [resolutionSource, setResolutionSource] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const [resolveByField, setResolveByField] = useState("");
  const [isElectoral, setIsElectoral] = useState(false);

  const [winningOutcomeId, setWinningOutcomeId] = useState("");
  const [justification, setJustification] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [newsTitle, setNewsTitle] = useState("");
  const [newsUrl, setNewsUrl] = useState("");
  const [newsErr, setNewsErr] = useState<string | null>(null);

  useEffect(() => {
    if (!market) return;
    setTitle(market.title);
    setDescription(market.description ?? "");
    setResolutionCriteria(market.resolutionCriteria);
    setResolutionSource(market.resolutionSource);
    setCloseAt(dtLocal(market.closeAt));
    setResolveByField(dtLocal(market.resolveBy));
    setIsElectoral(market.isElectoral);
  }, [market?.id]);

  async function refresh() {
    await Promise.all([utils.market.get.invalidate({ slug }), utils.admin.listMarkets.invalidate()]);
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!market) return;
    setMsg(null); setErr(null);
    try {
      await updateMutation.mutateAsync({
        id: market.id, title, description: description || null,
        resolutionCriteria, resolutionSource,
        closeAt: new Date(closeAt).toISOString(), resolveBy: new Date(resolveByField).toISOString(),
        isElectoral,
      });
      setMsg("Salvo.");
      await refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro ao salvar");
    }
  }

  async function onPublish() {
    if (!market) return;
    setMsg(null); setErr(null);
    try {
      await publishMutation.mutateAsync({ id: market.id });
      setMsg("Publicado.");
      await refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro ao publicar");
    }
  }

  async function onResolve(e: FormEvent) {
    e.preventDefault();
    if (!market || !winningOutcomeId) return;
    setMsg(null); setErr(null);
    try {
      const r = await resolveMutation.mutateAsync({
        marketId: market.id, winningOutcomeId, justification, sourceUrl,
      });
      setMsg(`Resolvido — ${r.payouts} posições pagas, ${r.totalPaid.toFixed(0)} pts.`);
      await refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro ao resolver");
    }
  }

  function isValidUrl(s: string): boolean {
    try { new URL(s); return true; } catch { return false; }
  }

  async function onVoid(e: FormEvent) {
    e.preventDefault();
    if (!market) return;
    setMsg(null); setErr(null);
    // Anular é um botão avulso (type="button"), não um submit — não passa pela
    // validação nativa do <form> (que exige esses campos só pro Resolver).
    // Sem isso, clicar aqui com justificativa/fonte vazias manda direto pro
    // servidor e volta um 400 cru, sem dizer o que falta preencher.
    if (justification.trim().length < 10) {
      setErr("Preencha a justificativa (mín. 10 caracteres) antes de anular.");
      return;
    }
    if (!isValidUrl(sourceUrl)) {
      setErr("Preencha uma URL de fonte válida antes de anular.");
      return;
    }
    if (!confirm("Anular este mercado? Todo o comprometido é devolvido.")) return;
    try {
      const r = await voidMutation.mutateAsync({ marketId: market.id, justification, sourceUrl });
      setMsg(`Anulado — ${r.refunds} posições devolvidas.`);
      await refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro ao anular");
    }
  }

  async function onAddNews(e: FormEvent) {
    e.preventDefault();
    if (!market) return;
    setNewsErr(null);
    try {
      await addNewsMutation.mutateAsync({ marketId: market.id, title: newsTitle.trim(), url: newsUrl.trim() });
      setNewsTitle(""); setNewsUrl("");
      await utils.news.list.invalidate({ marketId: market.id });
    } catch (e2) {
      setNewsErr(e2 instanceof Error ? e2.message : "Erro ao adicionar notícia");
    }
  }

  async function onRemoveNews(id: string) {
    if (!market) return;
    await removeNewsMutation.mutateAsync({ id });
    await utils.news.list.invalidate({ marketId: market.id });
  }

  async function onToggleFeatured() {
    if (!market) return;
    await setFeaturedMutation.mutateAsync({ id: market.id, featured: !market.featured });
    await refresh();
  }

  if (isLoading) return <div className="card"><p className="hint-text">Carregando…</p></div>;
  if (error || !market) return <div className="card"><p className="error-text">Mercado não encontrado.</p></div>;

  const canResolveOrVoid = ["OPEN", "CLOSED"].includes(market.status);
  const shareUrl = `${window.location.origin}/m/${market.slug}`;
  const cardUrl = `${window.location.origin}/card/${market.slug}.png`;

  async function onCopyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: 0 }}>{market.title}</h1>
        <span className={`badge ${market.status === "DRAFT" ? "badge-draft" : ""}`}>
          {STATUS_LABEL[market.status] ?? market.status}
        </span>
      </div>

      {msg && <div className="card" style={{ marginTop: 12, color: "var(--conferido)" }}>{msg}</div>}
      {err && <div className="card" style={{ marginTop: 12 }}><p className="error-text" style={{ margin: 0 }}>{err}</p></div>}

      {canEdit && market.status === "OPEN" && (
        <div className="card" style={{ marginTop: 20 }}>
          <label className="checkbox-row" style={{ marginBottom: 0 }}>
            <input type="checkbox" checked={market.featured} onChange={onToggleFeatured} disabled={setFeaturedMutation.isPending} />
            Destacar na home (aparece no slide de destaque)
          </label>
        </div>
      )}

      {market.status !== "DRAFT" && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Compartilhamento</h2>
          <p className="hint-text" style={{ marginBottom: 12 }}>
            Card exibido quando este link é compartilhado no WhatsApp, Twitter/X ou Discord.
          </p>
          <img
            src={cardUrl} alt={`Card de compartilhamento — ${market.title}`}
            style={{ width: "100%", maxWidth: 480, border: "1px solid var(--linha)", display: "block" }}
          />
          <div className="field" style={{ marginTop: 12 }}>
            <label className="label">Link compartilhável</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn-outline" style={{ width: "auto", whiteSpace: "nowrap" }} onClick={onCopyLink}>
                {copied ? "Copiado!" : "Copiar link"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Notícias relacionadas</h2>
        <p className="hint-text" style={{ marginBottom: 12 }}>
          Aparecem como "Leitura relacionada" na página do mercado.
        </p>
        {!news || news.length === 0 ? (
          <p className="hint-text" style={{ marginBottom: canEdit ? 12 : 0 }}>Nenhuma ainda.</p>
        ) : (
          news.map((n) => (
            <div key={n.id} className="admin-row">
              <span className="titulo">
                <a href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a>
              </span>
              {canEdit && (
                <button
                  className="btn-outline btn-danger" style={{ padding: "8px 14px", fontSize: 13 }}
                  onClick={() => onRemoveNews(n.id)} disabled={removeNewsMutation.isPending}
                >
                  Remover
                </button>
              )}
            </div>
          ))
        )}
        {canEdit && (
          <form onSubmit={onAddNews} style={{ marginTop: 12 }}>
            <div className="field">
              <label className="label">Título</label>
              <input className="input" value={newsTitle} onChange={(e) => setNewsTitle(e.target.value)} required />
            </div>
            <div className="field">
              <label className="label">URL</label>
              <input className="input" type="url" value={newsUrl} onChange={(e) => setNewsUrl(e.target.value)} required />
            </div>
            {newsErr && <p className="error-text">{newsErr}</p>}
            <button className="btn-outline" style={{ width: "auto", padding: "10px 16px" }} disabled={addNewsMutation.isPending}>
              {addNewsMutation.isPending ? "Adicionando…" : "Adicionar notícia"}
            </button>
          </form>
        )}
      </div>

      {market.status === "DRAFT" && canEdit && (
        <div className="card" style={{ marginTop: 20 }}>
          <p className="hint-text" style={{ marginBottom: 12 }}>
            Rascunho — não aparece pro público até publicar.
          </p>
          <button className="btn" style={{ width: "auto" }} onClick={onPublish} disabled={publishMutation.isPending}>
            {publishMutation.isPending ? "Publicando…" : "Publicar mercado"}
          </button>
        </div>
      )}

      {canEdit && ["DRAFT", "OPEN"].includes(market.status) && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Editar</h2>
          <form onSubmit={onSaveEdit}>
            <div className="field">
              <label className="label">Título</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="field">
              <label className="label">Descrição</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Critério de resolução</label>
              <textarea value={resolutionCriteria} onChange={(e) => setResolutionCriteria(e.target.value)} required />
            </div>
            <div className="field">
              <label className="label">Fonte de resolução</label>
              <input className="input" value={resolutionSource} onChange={(e) => setResolutionSource(e.target.value)} required />
            </div>
            <div className="field">
              <label className="label">Encerra em</label>
              <input className="input" type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} required />
            </div>
            <div className="field">
              <label className="label">Resolve até</label>
              <input className="input" type="datetime-local" value={resolveByField} onChange={(e) => setResolveByField(e.target.value)} required />
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={isElectoral} onChange={(e) => setIsElectoral(e.target.checked)} />
              Mercado eleitoral
            </label>
            <button className="btn" style={{ width: "auto" }} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando…" : "Salvar alterações"}
            </button>
          </form>
        </div>
      )}

      {canResolveOrVoid && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Resolver / Anular</h2>
          <form onSubmit={onResolve}>
            <div className="field">
              <label className="label">Outcome vencedor</label>
              <select value={winningOutcomeId} onChange={(e) => setWinningOutcomeId(e.target.value)} required>
                <option value="">selecione</option>
                {market.outcomes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Justificativa (pública)</label>
              <textarea value={justification} onChange={(e) => setJustification(e.target.value)} required minLength={10} />
            </div>
            <div className="field">
              <label className="label">Fonte (URL, pública)</label>
              <input className="input" type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} required />
            </div>
            <div className="form-actions">
              <button className="btn" disabled={resolveMutation.isPending || !winningOutcomeId}>
                {resolveMutation.isPending ? "Resolvendo…" : "Resolver mercado"}
              </button>
              <button type="button" className="btn-outline btn-danger" onClick={onVoid} disabled={voidMutation.isPending}>
                {voidMutation.isPending ? "Anulando…" : "Anular mercado"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
