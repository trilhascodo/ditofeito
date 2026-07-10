import { useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";

const pct = (p: number) => `${(p * 100).toFixed(p >= 0.995 ? 1 : 0)}%`;

const STATUS_LABEL: Record<string, string> = {
  CLOSED: "ENCERRADO", RESOLVED: "RESOLVIDO", VOIDED: "ANULADO",
};

// Ícone por categoria — emoji, não foto (identidade §7: sem tratamento
// heroico/pejorativo de candidatos). Fundo é sempre violeta-2, nunca uma
// cor "de bandeira" por categoria — consistência de marca > variedade.
const CATEGORY_EMOJI: Record<string, string> = {
  "eleicoes-2026": "🗳️",
};
const FALLBACK_EMOJI = "◆";

function relativeClose(closeAt: string | Date): string {
  const diff = new Date(closeAt).getTime() - Date.now();
  if (diff <= 0) return "encerrado";
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) return `encerra em ${days} dia${days > 1 ? "s" : ""}`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return `encerra em ${hours}h`;
  const mins = Math.max(1, Math.floor(diff / 60_000));
  return `encerra em ${mins}min`;
}

export function Home() {
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const { data: categories } = trpc.market.categories.useQuery();
  const { data: markets, isLoading, error } = trpc.market.list.useQuery(
    categorySlug ? { categorySlug } : undefined,
  );

  return (
    <main className="page">
      <h1 style={{ fontFamily: "var(--serif)", fontSize: 32, marginBottom: 4 }}>
        Dito<span style={{ color: "var(--violeta)" }}>Feito</span>
      </h1>
      <p className="hint-text" style={{ marginBottom: 20 }}>pode escrever</p>

      {categories && categories.length > 0 && (
        <div className="cat-tabs">
          <button
            className={`cat-tab ${categorySlug === null ? "on" : ""}`}
            onClick={() => setCategorySlug(null)}
          >
            Todos
          </button>
          {categories.map((c) => (
            <button
              key={c.slug}
              className={`cat-tab ${categorySlug === c.slug ? "on" : ""}`}
              onClick={() => setCategorySlug(c.slug)}
            >
              {c.name}
            </button>
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
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
