import { Link, useSearchParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { pct, relativeClose } from "../lib/format";

const STATUS_LABEL: Record<string, string> = {
  CLOSED: "ENCERRADO", RESOLVED: "RESOLVIDO", VOIDED: "ANULADO",
};

// Ícone por categoria — emoji, não foto (identidade §7: sem tratamento
// heroico/pejorativo de candidatos). Fundo é sempre violeta-2, nunca uma
// cor "de bandeira" por categoria — consistência de marca > variedade.
const CATEGORY_EMOJI: Record<string, string> = {
  "eleicoes-2026": "🗳️",
  "esportes": "🏆",
  "entretenimento": "🎬",
  "mencoes": "💬",
};
const FALLBACK_EMOJI = "◆";

export function Home() {
  const [searchParams] = useSearchParams();
  const categorySlug = searchParams.get("categoria");
  const { data: categories } = trpc.market.categories.useQuery();
  const { data: markets, isLoading, error } = trpc.market.list.useQuery(
    categorySlug ? { categorySlug } : undefined,
  );

  return (
    <main className="page">
      <h1 style={{ fontFamily: "var(--serif)", fontSize: 32, marginBottom: 20 }}>
        pode escrever
      </h1>

      {categories && categories.length > 0 && (
        <div className="cat-tabs">
          <Link className={`cat-tab ${categorySlug === null ? "on" : ""}`} to="/">
            Todos
          </Link>
          {categories.map((c) => (
            <Link
              key={c.slug}
              className={`cat-tab ${categorySlug === c.slug ? "on" : ""}`}
              to={`/?categoria=${c.slug}`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {isLoading && <p className="hint-text">Carregando mercados…</p>}
      {error && <p className="error-text">Não deu pra carregar os mercados agora.</p>}
      {markets && markets.length === 0 && (
        <p className="hint-text">Ninguém disse nada ainda. Diga primeiro.</p>
      )}

      {markets && markets.length > 0 && (
        <div className="market-grid">
          {markets.map((m) => (
            <Link key={m.slug} to={`/m/${m.slug}`} className="market-tile">
              <div className="market-tile-top">
                <span className="market-tile-icon">{CATEGORY_EMOJI[m.categorySlug] ?? FALLBACK_EMOJI}</span>
                <span className="market-tile-category">{m.categoryName}</span>
                {m.status !== "OPEN" && (
                  <span className="badge" style={{ marginLeft: "auto" }}>
                    {STATUS_LABEL[m.status] ?? m.status}
                  </span>
                )}
              </div>
              <h3 className="market-tile-title">{m.title}</h3>
              <div className="market-tile-bottom">
                <span className="hint-text">{relativeClose(m.closeAt)}</span>
                {m.summary && (
                  <span className="market-tile-price mono">
                    {m.summary.label !== "SIM" ? `${m.summary.label} ` : ""}
                    {pct(m.summary.price)}
                  </span>
                )}
              </div>
              {m.sponsor && (
                <div className="market-tile-sponsor">
                  {m.sponsor.logoUrl && <img src={m.sponsor.logoUrl} alt="" height={14} style={{ width: "auto", maxWidth: 48 }} />}
                  {m.sponsor.label} <b>{m.sponsor.name}</b>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
