import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";

interface PrefillState {
  prefillTitle?: string; prefillCriteria?: string; prefillSource?: string;
}

// Espelha o regex de apps/api/src/routers/market.ts (slug) — sanitiza a
// cada tecla (sem cortar hífen final, pra não atrapalhar quem tá digitando
// "abc-def"); finalizeSlug() só corta as pontas no blur/submit.
function sanitizeSlugLive(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-");
}
function finalizeSlug(s: string): string {
  return sanitizeSlugLive(s).replace(/(^-|-$)/g, "");
}

function plusDaysLocal(dtLocalStr: string, days: number): string {
  const d = new Date(dtLocalStr);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdminMarketNew() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state ?? {}) as PrefillState;
  const { data: categories } = trpc.market.categories.useQuery();
  const createMutation = trpc.market.create.useMutation();

  const [slug, setSlug] = useState(prefill.prefillTitle ? finalizeSlug(prefill.prefillTitle) : "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [title, setTitle] = useState(prefill.prefillTitle ?? "");
  const [description, setDescription] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [type, setType] = useState<"BINARY" | "MULTI">("BINARY");
  const [outcomes, setOutcomes] = useState(["", ""]);
  const [includeCatchall, setIncludeCatchall] = useState(true);
  const [resolutionCriteria, setResolutionCriteria] = useState(prefill.prefillCriteria ?? "");
  const [resolutionSource, setResolutionSource] = useState(prefill.prefillSource ?? "");
  const [closeAt, setCloseAt] = useState("");
  const [resolveBy, setResolveBy] = useState("");
  const [resolveByTouched, setResolveByTouched] = useState(false);
  const [isElectoral, setIsElectoral] = useState(false);
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function onTitleChange(v: string) {
    setTitle(v);
    if (!slugTouched) setSlug(finalizeSlug(v));
  }

  function onCloseAtChange(v: string) {
    setCloseAt(v);
    if (!resolveByTouched) setResolveBy(v ? plusDaysLocal(v, 1) : "");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const finalSlug = finalizeSlug(slug);
    if (!finalSlug) { setError("Slug inválido — use letras minúsculas, números e hífen."); return; }
    if (closeAt && resolveBy && new Date(resolveBy) <= new Date(closeAt)) {
      setError('"Resolve até" precisa ser depois de "Encerra em".');
      return;
    }
    setSlug(finalSlug);
    try {
      const r = await createMutation.mutateAsync({
        slug: finalSlug, title: title.trim(), description: description.trim() || undefined,
        categorySlug, type,
        outcomes: type === "MULTI"
          ? outcomes.filter((o) => o.trim()).map((label) => ({ label: label.trim() }))
          : undefined,
        includeCatchall, resolutionCriteria: resolutionCriteria.trim(), resolutionSource: resolutionSource.trim(),
        closeAt: new Date(closeAt).toISOString(), resolveBy: new Date(resolveBy).toISOString(),
        isElectoral, publish,
      });
      navigate(`/admin/mercados/${r.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar mercado");
    }
  }

  return (
    <div>
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: 0 }}>Novo mercado</h1>
        {prefill.prefillTitle && (
          <p className="hint-text" style={{ marginTop: 8 }}>
            Pré-preenchido a partir de uma solicitação — revise título, critério e fonte antes de publicar,
            como qualquer outro mercado.
          </p>
        )}
      </div>
      <form onSubmit={onSubmit}>
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Informações básicas</h2>
          <div className="field">
            <label className="label" htmlFor="title">Título</label>
            <input className="input" id="title" value={title} onChange={(e) => onTitleChange(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label" htmlFor="slug">Slug</label>
            <input
              className="input" id="slug" value={slug}
              onChange={(e) => { setSlug(sanitizeSlugLive(e.target.value)); setSlugTouched(true); }}
              onBlur={() => setSlug(finalizeSlug(slug))}
              required
            />
            <p className="hint-text" style={{ marginTop: 4 }}>
              Preenchido a partir do título; edite se quiser um link diferente.
            </p>
          </div>
          <div className="field">
            <label className="label" htmlFor="description">Descrição (opcional)</label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="categorySlug">Categoria</label>
            <select id="categorySlug" value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} required>
              <option value="">selecione</option>
              {categories?.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="type">Tipo</label>
            <select id="type" value={type} onChange={(e) => setType(e.target.value as "BINARY" | "MULTI")}>
              <option value="BINARY">Binário (SIM/NÃO)</option>
              <option value="MULTI">Múltipla escolha</option>
            </select>
          </div>
          {type === "MULTI" && (
            <div className="field">
              <label className="label">Outcomes</label>
              {outcomes.map((o, i) => (
                <input
                  key={i} className="input" style={{ marginBottom: 6 }} value={o}
                  placeholder={`Outcome ${i + 1}`}
                  onChange={(e) => setOutcomes(outcomes.map((x, j) => (j === i ? e.target.value : x)))}
                />
              ))}
              <button type="button" className="btn-outline" style={{ padding: "8px 14px", fontSize: 13 }}
                      onClick={() => setOutcomes([...outcomes, ""])}>
                + outcome
              </button>
              <label className="checkbox-row" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={includeCatchall} onChange={(e) => setIncludeCatchall(e.target.checked)} />
                Incluir "OUTROS" (cauda longa)
              </label>
            </div>
          )}
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Resolução</h2>
          <div className="field">
            <label className="label" htmlFor="resolutionCriteria">Critério de resolução</label>
            <textarea id="resolutionCriteria" value={resolutionCriteria}
                      onChange={(e) => setResolutionCriteria(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label" htmlFor="resolutionSource">Fonte de resolução</label>
            <input className="input" id="resolutionSource" value={resolutionSource}
                   onChange={(e) => setResolutionSource(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label" htmlFor="closeAt">Encerra em</label>
            <input className="input" id="closeAt" type="datetime-local" value={closeAt}
                   onChange={(e) => onCloseAtChange(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label" htmlFor="resolveBy">Resolve até</label>
            <input className="input" id="resolveBy" type="datetime-local" value={resolveBy}
                   onChange={(e) => { setResolveBy(e.target.value); setResolveByTouched(true); }} required />
            <p className="hint-text" style={{ marginTop: 4 }}>Precisa ser depois de "Encerra em".</p>
          </div>
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Publicação</h2>
          <label className="checkbox-row">
            <input type="checkbox" checked={isElectoral} onChange={(e) => setIsElectoral(e.target.checked)} />
            Mercado eleitoral (mostra disclaimer da Lei 9.504/97)
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            Publicar direto (senão fica em rascunho pra revisão editorial)
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn" style={{ marginTop: 6 }} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Criando…" : "Criar mercado"}
          </button>
        </div>
      </form>
    </div>
  );
}
