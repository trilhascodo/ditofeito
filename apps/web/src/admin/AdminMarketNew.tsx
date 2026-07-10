import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";

export function AdminMarketNew() {
  const navigate = useNavigate();
  const { data: categories } = trpc.market.categories.useQuery();
  const createMutation = trpc.market.create.useMutation();

  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [type, setType] = useState<"BINARY" | "MULTI">("BINARY");
  const [outcomes, setOutcomes] = useState(["", ""]);
  const [includeCatchall, setIncludeCatchall] = useState(true);
  const [resolutionCriteria, setResolutionCriteria] = useState("");
  const [resolutionSource, setResolutionSource] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const [resolveBy, setResolveBy] = useState("");
  const [isElectoral, setIsElectoral] = useState(false);
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await createMutation.mutateAsync({
        slug: slug.trim(), title: title.trim(), description: description.trim() || undefined,
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
    <div className="card">
      <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: "0 0 16px" }}>Novo mercado</h1>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label className="label" htmlFor="slug">Slug</label>
          <input className="input" id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="title">Título</label>
          <input className="input" id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
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
                 onChange={(e) => setCloseAt(e.target.value)} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="resolveBy">Resolve até</label>
          <input className="input" id="resolveBy" type="datetime-local" value={resolveBy}
                 onChange={(e) => setResolveBy(e.target.value)} required />
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={isElectoral} onChange={(e) => setIsElectoral(e.target.checked)} />
          Mercado eleitoral (mostra disclaimer da Lei 9.504/97)
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
          Publicar direto (senão fica em rascunho pra revisão editorial)
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Criando…" : "Criar mercado"}
        </button>
      </form>
    </div>
  );
}
