import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";

const pct = (p: number) => `${(p * 100).toFixed(p >= 0.995 ? 1 : 0)}%`;

const STATUS_LABEL: Record<string, string> = {
  CLOSED: "ENCERRADO", RESOLVED: "RESOLVIDO", VOIDED: "ANULADO",
};

export function Home() {
  const { data: markets, isLoading, error } = trpc.market.list.useQuery();

  return (
    <main className="page">
      <h1 style={{ fontFamily: "var(--serif)", fontSize: 32, marginBottom: 4 }}>
        Dito<span style={{ color: "var(--violeta)" }}>Feito</span>
      </h1>
      <p className="hint-text" style={{ marginBottom: 28 }}>pode escrever</p>

      {isLoading && <p className="hint-text">Carregando mercados…</p>}
      {error && <p className="error-text">Não deu pra carregar os mercados agora.</p>}
      {markets && markets.length === 0 && (
        <p className="hint-text">Ninguém disse nada ainda. Diga primeiro.</p>
      )}

      {markets && markets.length > 0 && (
        <div className="market-groups">
          {groupByCategory(markets).map(([categoryName, group]) => (
            <section key={categoryName} className="market-group">
              <h2 className="category-heading">{categoryName}</h2>
              <div className="market-list">
                {group.map((m) => (
                  <Link key={m.slug} to={`/m/${m.slug}`} className="market-card">
                    <span className="market-card-title">{m.title}</span>
                    {m.status !== "OPEN" && (
                      <span className="badge">{STATUS_LABEL[m.status] ?? m.status}</span>
                    )}
                    {m.summary && (
                      <span className="market-card-price mono">
                        {m.summary.label !== "SIM" ? `${m.summary.label} ` : ""}
                        {pct(m.summary.price)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

interface MarketListItem {
  slug: string; title: string; status: string; categoryName: string;
  summary: { label: string; price: number } | null;
}

function groupByCategory(markets: MarketListItem[]): [string, MarketListItem[]][] {
  const map = new Map<string, MarketListItem[]>();
  for (const m of markets) {
    const arr = map.get(m.categoryName) ?? [];
    arr.push(m);
    map.set(m.categoryName, arr);
  }
  return [...map.entries()];
}
