import { useState } from "react";
import { trpc } from "../lib/trpc";

const OFFICE_LABEL = {
  PRESIDENTE: "Presidente", GOVERNADOR: "Governador(a)", SENADOR: "Senador(a)",
  DEP_FEDERAL: "Deputado(a) Federal", DEP_ESTADUAL: "Deputado(a) Estadual",
  PREFEITO: "Prefeito(a)", VEREADOR: "Vereador(a)",
} as const;
type Office = keyof typeof OFFICE_LABEL;

export function AdminCandidates() {
  const utils = trpc.useUtils();
  const [office, setOffice] = useState<Office | "">("");
  const [uf, setUf] = useState("");
  const [search, setSearch] = useState("");
  const { data: candidates, isLoading } = trpc.candidate.list.useQuery({
    status: "PRE_ANUNCIADO",
    office: office || undefined,
    uf: uf.length === 2 ? uf : undefined,
    search: search.trim() || undefined,
  });
  const removeMutation = trpc.candidate.remove.useMutation();
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function onRemove(id: string) {
    if (!confirm("Remover essa sugestão de pré-candidato?")) return;
    setRemovingId(id);
    try {
      await removeMutation.mutateAsync({ id });
      await utils.candidate.list.invalidate();
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="card">
      <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: "0 0 4px" }}>Fila de moderação — candidatos</h1>
      <p className="hint-text" style={{ marginBottom: 12 }}>Sugestões pendentes de revisão (PRE_ANUNCIADO).</p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          className="input" style={{ flex: "2 1 200px" }} type="search" placeholder="Buscar por nome…"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <select style={{ flex: "1 1 160px" }} value={office} onChange={(e) => setOffice(e.target.value as Office | "")}>
          <option value="">todos os cargos</option>
          {Object.entries(OFFICE_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <input
          className="input" style={{ flex: "0 1 90px" }} maxLength={2} placeholder="UF"
          value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())}
        />
      </div>

      {isLoading && <p className="hint-text">Carregando…</p>}
      {candidates && candidates.length === 0 && <p className="hint-text">Nada pendente com esse filtro.</p>}
      {candidates?.map((c) => (
        <div key={c.id} className="admin-row">
          <span className="titulo">
            {c.name} {c.public_name ? `(${c.public_name})` : ""}
            <div className="meta">
              {(OFFICE_LABEL as Record<string, string>)[c.office] ?? c.office}{c.uf ? `/${c.uf}` : ""} · {c.party} ·{" "}
              <a href={c.source_url} target="_blank" rel="noopener noreferrer">fonte</a>
            </div>
          </span>
          <button
            className="btn-outline btn-danger" style={{ padding: "8px 14px", fontSize: 13 }}
            onClick={() => onRemove(c.id)} disabled={removingId === c.id}
          >
            {removingId === c.id ? "Removendo…" : "Remover"}
          </button>
        </div>
      ))}
    </div>
  );
}
