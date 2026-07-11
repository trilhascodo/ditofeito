import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "RASCUNHO", OPEN: "ABERTO", CLOSED: "ENCERRADO", RESOLVED: "RESOLVIDO", VOIDED: "ANULADO",
};
const STATUS_ORDER = ["DRAFT", "OPEN", "CLOSED", "RESOLVED", "VOIDED"];

const dataFmt = (d: Date | string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

type Filter = "ALL" | "OVERDUE" | (typeof STATUS_ORDER)[number];

export function AdminMarkets() {
  const { data: markets, isLoading, error } = trpc.admin.listMarkets.useQuery();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: markets?.length ?? 0, OVERDUE: 0 };
    for (const s of STATUS_ORDER) c[s] = 0;
    for (const m of markets ?? []) {
      c[m.status] = (c[m.status] ?? 0) + 1;
      if (m.overdue) c.OVERDUE += 1;
    }
    return c;
  }, [markets]);

  const filtered = useMemo(() => {
    let list = markets ?? [];
    if (filter === "OVERDUE") list = list.filter((m) => m.overdue);
    else if (filter !== "ALL") list = list.filter((m) => m.status === filter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((m) => m.title.toLowerCase().includes(q));
    return list;
  }, [markets, filter, search]);

  return (
    <div className="card">
      <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: "0 0 12px" }}>Mercados</h1>

      {markets && markets.length > 0 && (
        <>
          <input
            className="input" style={{ marginBottom: 12 }} type="search" placeholder="Buscar por título…"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          <div className="cat-tabs">
            <button type="button" className={`cat-tab ${filter === "ALL" ? "on" : ""}`} onClick={() => setFilter("ALL")}>
              Todos ({counts.ALL})
            </button>
            {counts.OVERDUE > 0 && (
              <button type="button" className={`cat-tab ${filter === "OVERDUE" ? "on" : ""}`} onClick={() => setFilter("OVERDUE")}>
                Vencidos ({counts.OVERDUE})
              </button>
            )}
            {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
              <button key={s} type="button" className={`cat-tab ${filter === s ? "on" : ""}`} onClick={() => setFilter(s)}>
                {STATUS_LABEL[s]} ({counts[s]})
              </button>
            ))}
          </div>
        </>
      )}

      {isLoading && <p className="hint-text">Carregando…</p>}
      {error && <p className="error-text">Não foi possível carregar os mercados.</p>}
      {markets && markets.length === 0 && <p className="hint-text">Nenhum mercado ainda.</p>}
      {markets && markets.length > 0 && filtered.length === 0 && (
        <p className="hint-text">Nenhum mercado bate com esse filtro.</p>
      )}
      {filtered.map((m) => (
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
