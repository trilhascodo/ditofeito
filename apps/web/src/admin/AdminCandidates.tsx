import { useState } from "react";
import { trpc } from "../lib/trpc";

const OFFICE_LABEL: Record<string, string> = {
  PRESIDENTE: "Presidente", GOVERNADOR: "Governador(a)", SENADOR: "Senador(a)",
  DEP_FEDERAL: "Deputado(a) Federal", DEP_ESTADUAL: "Deputado(a) Estadual",
  PREFEITO: "Prefeito(a)", VEREADOR: "Vereador(a)",
};

export function AdminCandidates() {
  const utils = trpc.useUtils();
  const { data: candidates, isLoading } = trpc.candidate.list.useQuery({ status: "PRE_ANUNCIADO" });
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
      {isLoading && <p className="hint-text">Carregando…</p>}
      {candidates && candidates.length === 0 && <p className="hint-text">Nada pendente.</p>}
      {candidates?.map((c) => (
        <div key={c.id} className="admin-row">
          <span className="titulo">
            {c.name} {c.public_name ? `(${c.public_name})` : ""}
            <div className="meta">
              {OFFICE_LABEL[c.office] ?? c.office}{c.uf ? `/${c.uf}` : ""} · {c.party} ·{" "}
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
