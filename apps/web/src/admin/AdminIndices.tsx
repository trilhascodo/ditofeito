import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";

export function AdminIndices() {
  const utils = trpc.useUtils();
  const { data: indices } = trpc.indexSeries.adminList.useQuery();
  const { data: groups } = trpc.indexSeries.listAvailableGroups.useQuery();
  const createIndex = trpc.indexSeries.create.useMutation();
  const updateIndex = trpc.indexSeries.update.useMutation();
  const removeIndex = trpc.indexSeries.remove.useMutation();

  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [groupId, setGroupId] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPublic, setEditPublic] = useState(true);

  async function refresh() {
    await Promise.all([utils.indexSeries.adminList.invalidate(), utils.indexSeries.listAvailableGroups.invalidate()]);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!groupId) { setErr("Escolha um grupo de mercado."); return; }
    try {
      await createIndex.mutateAsync({
        slug: slug.trim(), title: title.trim(), groupId,
        description: description.trim(), isPublic,
      });
      setSlug(""); setTitle(""); setGroupId(""); setDescription(""); setIsPublic(true);
      await refresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Erro ao criar índice");
    }
  }

  function onStartEdit(idx: { id: string; title: string; isPublic: boolean }) {
    setEditingId(idx.id); setEditTitle(idx.title); setEditPublic(idx.isPublic);
    setEditDescription("");
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    await updateIndex.mutateAsync({
      id: editingId, title: editTitle.trim(),
      description: editDescription.trim(), isPublic: editPublic,
    });
    setEditingId(null);
    await refresh();
  }

  async function onRemove(id: string) {
    if (!confirm("Remover esse índice?")) return;
    await removeIndex.mutateAsync({ id });
    await refresh();
  }

  return (
    <div>
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: 0 }}>Índices citáveis</h1>
        <p className="hint-text" style={{ marginTop: 8 }}>
          Cada índice espelha o mercado "Quem vence...?" de um grupo (gerador.ts eleitoral
          já cria esses grupos por disputa) com metodologia pública, num slug estável pra
          imprensa citar. Publicado em <Link to="/indices">/indices</Link>.
        </p>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Novo índice</h2>
        {!groups || groups.length === 0 ? (
          <p className="hint-text">
            Nenhum grupo de mercado disponível (ou todos já têm índice). Grupos vêm do
            gerador eleitoral automaticamente.
          </p>
        ) : (
          <form onSubmit={onCreate}>
            <div className="field">
              <label className="label" htmlFor="idx-group">Grupo de mercado</label>
              <select id="idx-group" value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
                <option value="">selecione</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="idx-slug">Slug (URL)</label>
              <input className="input" id="idx-slug" placeholder="governador-ma-2026"
                     value={slug} onChange={(e) => setSlug(e.target.value)} required />
            </div>
            <div className="field">
              <label className="label" htmlFor="idx-title">Título</label>
              <input className="input" id="idx-title" placeholder="Índice DitoFeito — Governador/MA 2026"
                     value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="field">
              <label className="label" htmlFor="idx-desc">Metodologia</label>
              <textarea id="idx-desc" placeholder="Como o índice é calculado, de onde vêm os dados…"
                        value={description} onChange={(e) => setDescription(e.target.value)} required />
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
              Público (visível em /indices e /indice/:slug)
            </label>
            {err && <p className="error-text">{err}</p>}
            <button className="btn" style={{ width: "auto" }} disabled={createIndex.isPending}>
              {createIndex.isPending ? "Criando…" : "Criar índice"}
            </button>
          </form>
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Índices cadastrados</h2>
        {!indices || indices.length === 0 ? (
          <p className="hint-text">Nenhum índice ainda.</p>
        ) : (
          indices.map((idx) =>
            editingId === idx.id ? (
              <form key={idx.id} onSubmit={onSaveEdit} className="admin-row" style={{ flexWrap: "wrap" }}>
                <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
                  <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required placeholder="Título" />
                </div>
                <div className="field" style={{ flex: "1 1 100%", marginBottom: 0 }}>
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="Nova metodologia (obrigatório salvar de novo)" required />
                </div>
                <label className="checkbox-row" style={{ flexBasis: "100%" }}>
                  <input type="checkbox" checked={editPublic} onChange={(e) => setEditPublic(e.target.checked)} />
                  Público
                </label>
                <button className="btn-outline" style={{ padding: "8px 14px", fontSize: 13, width: "auto" }} disabled={updateIndex.isPending}>
                  {updateIndex.isPending ? "Salvando…" : "Salvar"}
                </button>
                <button type="button" className="link-btn" onClick={() => setEditingId(null)}>Cancelar</button>
              </form>
            ) : (
              <div key={idx.id} className="admin-row">
                <span className="titulo">
                  {idx.title}
                  <div className="meta">
                    /indice/{idx.slug} · {idx.groupTitle ?? "sem grupo"}
                  </div>
                </span>
                <span className={`badge ${idx.isPublic ? "" : "badge-draft"}`}>{idx.isPublic ? "PÚBLICO" : "PRIVADO"}</span>
                <button
                  className="btn-outline" style={{ padding: "8px 14px", fontSize: 13, width: "auto" }}
                  onClick={() => onStartEdit(idx)}
                >
                  Editar
                </button>
                <button
                  className="btn-outline btn-danger" style={{ padding: "8px 14px", fontSize: 13, width: "auto" }}
                  onClick={() => onRemove(idx.id)} disabled={removeIndex.isPending}
                >
                  Remover
                </button>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}
