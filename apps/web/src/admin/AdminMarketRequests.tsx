import { useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";

const dtDisplay = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function AdminMarketRequests() {
  const utils = trpc.useUtils();
  const { data: requests } = trpc.marketRequests.list.useQuery();
  const approve = trpc.marketRequests.approve.useMutation();
  const reject = trpc.marketRequests.reject.useMutation();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  async function refresh() {
    await utils.marketRequests.list.invalidate();
  }

  async function onApprove(id: string) {
    await approve.mutateAsync({ id });
    await refresh();
  }

  async function onReject(id: string) {
    if (!rejectNote.trim()) return;
    await reject.mutateAsync({ id, adminNote: rejectNote.trim() });
    setRejectingId(null); setRejectNote("");
    await refresh();
  }

  const novos = requests?.filter((r) => r.status === "NOVO") ?? [];
  const decididos = requests?.filter((r) => r.status !== "NOVO") ?? [];

  return (
    <div>
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: 0 }}>Solicitações de mercado</h1>
        <p className="hint-text" style={{ marginTop: 8 }}>
          Propostas recebidas pela página pública /solicitar-mercado (veículos, agências etc.).
          Aprovar aqui só libera a criação — o mercado em si continua nascendo em rascunho, com
          critério de resolução e fonte revisados por você em <Link to="/admin/mercados/novo">Novo mercado</Link>.
        </p>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>
          Novas {novos.length > 0 && <span className="badge" style={{ marginLeft: 6 }}>{novos.length}</span>}
        </h2>
        {novos.length === 0 ? (
          <p className="hint-text">Nenhuma solicitação nova.</p>
        ) : (
          novos.map((r) => (
            <div key={r.id} className="admin-row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
              <span className="titulo">
                {r.proposedTitle}
                <div className="meta">
                  {r.name} ({r.company}) · <a href={`mailto:${r.email}`}>{r.email}</a>
                  {r.phone && <> · {r.phone}</>}
                  {" · "}{dtDisplay.format(new Date(r.createdAt))}
                </div>
                <p style={{ marginTop: 8, fontSize: 13 }}>
                  <b>Critério proposto:</b> {r.proposedCriteria}
                </p>
                <p style={{ marginTop: 4, fontSize: 13 }}>
                  <b>Fonte proposta:</b> {r.proposedSource}
                </p>
                {r.message && <p style={{ marginTop: 4, fontSize: 13 }}><b>Mensagem:</b> {r.message}</p>}
              </span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link
                  className="btn-outline" style={{ padding: "8px 14px", fontSize: 13 }}
                  to="/admin/mercados/novo"
                  state={{ prefillTitle: r.proposedTitle, prefillCriteria: r.proposedCriteria, prefillSource: r.proposedSource }}
                >
                  Criar mercado
                </Link>
                <button
                  className="btn-outline" style={{ padding: "8px 14px", fontSize: 13 }}
                  onClick={() => onApprove(r.id)} disabled={approve.isPending}
                >
                  Aprovar
                </button>
                {rejectingId === r.id ? (
                  <div style={{ display: "flex", gap: 6, flexBasis: "100%" }}>
                    <input
                      className="input" placeholder="Motivo da rejeição" value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)} style={{ flex: 1 }}
                    />
                    <button
                      className="btn-outline btn-danger" style={{ padding: "8px 14px", fontSize: 13, width: "auto" }}
                      onClick={() => onReject(r.id)} disabled={reject.isPending || !rejectNote.trim()}
                    >
                      Confirmar
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-outline btn-danger" style={{ padding: "8px 14px", fontSize: 13 }}
                    onClick={() => { setRejectingId(r.id); setRejectNote(""); }}
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
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Decididas</h2>
        {decididos.length === 0 ? (
          <p className="hint-text">Nenhuma ainda.</p>
        ) : (
          decididos.map((r) => (
            <div key={r.id} className="admin-row">
              <span className="titulo">
                {r.proposedTitle}
                <div className="meta">
                  {r.name} ({r.company}) · {dtDisplay.format(new Date(r.createdAt))}
                  {r.adminNote && ` · ${r.adminNote}`}
                </div>
              </span>
              <span className={`badge ${r.status === "REJEITADO" ? "badge-draft" : ""}`}>{r.status}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
