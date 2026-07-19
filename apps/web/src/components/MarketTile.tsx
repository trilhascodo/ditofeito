import { Link } from "react-router-dom";
import { pct, relativeClose } from "../lib/format";

const STATUS_LABEL: Record<string, string> = {
  CLOSED: "ENCERRADO", RESOLVED: "RESOLVIDO", VOIDED: "ANULADO",
};

const CATEGORY_EMOJI: Record<string, string> = {
  "eleicoes-2026": "🗳️",
  "esportes": "🏆",
  "entretenimento": "🎬",
  "mencoes": "💬",
};
const FALLBACK_EMOJI = "◆";

export interface MarketTileData {
  slug: string; title: string; status: string; closeAt: string | Date;
  categorySlug: string; categoryName: string;
  summary: { label: string; price: number } | null;
  sponsor: { label: string; name: string; logoUrl: string | null } | null;
}

// Card de mercado — usado na grade da home e em "continue explorando" (fim
// da página de mercado). Um componente só: evita o card de sugestão divergir
// visualmente do card "oficial" quando um dos dois lugares mudar.
export function MarketTile({ m }: { m: MarketTileData }) {
  return (
    <Link to={`/m/${m.slug}`} className="market-tile">
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
          <span className="market-tile-price">
            <small>{m.summary.label === "SIM" ? "chance de SIM" : m.summary.label}</small>
            <b className="mono">{pct(m.summary.price)}</b>
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
  );
}
