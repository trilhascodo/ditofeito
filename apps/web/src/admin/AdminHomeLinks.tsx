import { useState, type FormEvent } from "react";
import { trpc } from "../lib/trpc";

export function AdminHomeLinks() {
  const utils = trpc.useUtils();
  const { data: links } = trpc.homeLinks.list.useQuery();
  const addLink = trpc.homeLinks.add.useMutation();
  const removeLink = trpc.homeLinks.remove.useMutation();

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await addLink.mutateAsync({ title: title.trim(), url: url.trim() });
      setTitle(""); setUrl("");
      await utils.homeLinks.list.invalidate();
    } catch (err) {
      setErr(err instanceof Error ? err.message : "Erro ao adicionar link");
    }
  }

  async function onRemove(id: string) {
    if (!confirm("Remover esse link?")) return;
    await removeLink.mutateAsync({ id });
    await utils.homeLinks.list.invalidate();
  }

  return (
    <div>
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: 0 }}>Links úteis da home</h1>
        <p className="hint-text" style={{ marginTop: 8 }}>
          Aparecem na coluna lateral da home, abaixo dos anúncios — preenchem
          o espaço vazio quando a lateral fica mais curta que o conteúdo
          principal. Fontes oficiais, páginas do próprio site etc.
        </p>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Novo link</h2>
        <form onSubmit={onAdd}>
          <div className="field">
            <label className="label" htmlFor="hl-title">Título</label>
            <input className="input" id="hl-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label" htmlFor="hl-url">URL</label>
            <input className="input" id="hl-url" type="url" placeholder="https://…"
                   value={url} onChange={(e) => setUrl(e.target.value)} required />
          </div>
          {err && <p className="error-text">{err}</p>}
          <button className="btn" style={{ width: "auto" }} disabled={addLink.isPending}>
            {addLink.isPending ? "Adicionando…" : "Adicionar link"}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Links cadastrados</h2>
        {!links || links.length === 0 ? (
          <p className="hint-text">Nenhum link ainda.</p>
        ) : (
          links.map((l) => (
            <div key={l.id} className="admin-row">
              <span className="titulo">
                {l.title}
                <div className="meta">{l.url}</div>
              </span>
              <button
                className="btn-outline btn-danger" style={{ padding: "8px 14px", fontSize: 13 }}
                onClick={() => onRemove(l.id)} disabled={removeLink.isPending}
              >
                Remover
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
