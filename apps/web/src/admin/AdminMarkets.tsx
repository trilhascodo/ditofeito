import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "RASCUNHO", OPEN: "ABERTO", CLOSED: "ENCERRADO", RESOLVED: "RESOLVIDO", VOIDED: "ANULADO",
};

const dataFmt = (d: Date | string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export function AdminMarkets() {
  const { data: markets, isLoading, error } = trpc.admin.listMarkets.useQuery();

  return (
    <div className="card">
      <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: "0 0 12px" }}>Mercados</h1>
      {isLoading && <p className="hint-text">Carregando…</p>}
      {error && <p className="error-text">Não foi possível carregar os mercados.</p>}
      {markets && markets.length === 0 && <p className="hint-text">Nenhum mercado ainda.</p>}
      {markets?.map((m) => (
        <div key={m.id} className="admin-row">
          <span className="titulo">
            <Link to={`/admin/mercados/${m.slug}`}>{m.title}</Link>
            <div className="meta">
              {m.categoryName} · {m.type} · encerra {dataFmt(m.closeAt)} · resolve até {dataFmt(m.resolveBy)}
            </div>
          </span>
          {m.overdue && <span className="badge badge-overdue">VENCIDO</span>}
          <span className={`badge ${m.status === "DRAFT" ? "badge-draft" : ""}`}>
            {STATUS_LABEL[m.status] ?? m.status}
          </span>
        </div>
      ))}
    </div>
  );
}
