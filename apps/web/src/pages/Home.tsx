import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { pct, relativeClose } from "../lib/format";
import { pathFromSeries } from "../lib/chart";

const STATUS_LABEL: Record<string, string> = {
  CLOSED: "ENCERRADO", RESOLVED: "RESOLVIDO", VOIDED: "ANULADO",
};

interface FeaturedMarket {
  slug: string; title: string; type: string; closeAt: string; categoryName: string;
  summary: { label: string; price: number } | null;
  series: [number, number][];
}

// Slide de destaque (layout inspirado no carrossel do Polymarket — só a
// estrutura: 1 card grande por vez + navegação. Sem spread/combo/alavancagem,
// sem "$volume" — número é ponto e "chance de SIM" no nosso vocabulário).
function Destaque({ items }: { items: FeaturedMarket[] }) {
  const [idx, setIdx] = useState(0);
  if (items.length === 0) return null;
  const m = items[idx % items.length];
  const path = pathFromSeries(m.series, 640, 100, 4);

  return (
    <div className="destaque">
      <Link to={`/m/${m.slug}`} className="destaque-card">
        <span className="eyebrow">{m.categoryName}</span>
        <h2 className="destaque-titulo">{m.title}</h2>
        <div className="destaque-corpo">
          {m.summary && (
            <div className="destaque-stat">
              <b className="mono">{pct(m.summary.price)}</b>
              <span>{m.summary.label === "SIM" ? "chance de SIM" : m.summary.label}</span>
            </div>
          )}
          <svg viewBox="0 0 640 100" className="destaque-spark" preserveAspectRatio="none" aria-hidden="true">
            {path && <path d={path} fill="none" stroke="var(--violeta)" strokeWidth={3}
                            strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
        </div>
        <span className="hint-text">{relativeClose(m.closeAt)}</span>
      </Link>
      {items.length > 1 && (
        <div className="destaque-nav">
          <button type="button" aria-label="Destaque anterior"
                  onClick={() => setIdx((i) => (i - 1 + items.length) % items.length)}>‹</button>
          <div className="destaque-dots">
            {items.map((it, i) => (
              <button
                key={it.slug} type="button" aria-label={`Ir pro destaque ${i + 1}`}
                className={i === idx ? "on" : ""} onClick={() => setIdx(i)}
              />
            ))}
          </div>
          <button type="button" aria-label="Próximo destaque"
                  onClick={() => setIdx((i) => (i + 1) % items.length)}>›</button>
        </div>
      )}
    </div>
  );
}

interface HomeSponsor {
  label: string; sponsorName: string; logoUrl: string | null; siteUrl: string | null;
}

// Até 3 espaços de publicidade ao lado do destaque (layout.pdf — coluna
// lateral empilhada, não mais faixa única embaixo do grid). Só renderiza o
// que tiver patrocínio ativo — sem caixa vazia "espaço disponível".
// Nomes de classe em português de propósito: "ad-slot" em inglês cai nos
// filtros genéricos de ad blocker (escondia o bloco inteiro no desktop).
function PatroSlots({ items }: { items: HomeSponsor[] }) {
  return (
    <aside className="patro-slots">
      {items.map((s, i) => {
        const conteudo = (
          <>
            {s.logoUrl && <img src={s.logoUrl} alt="" />}
            <span className="patro-slot-label">{s.label}</span>
            <b>{s.sponsorName}</b>
          </>
        );
        return s.siteUrl ? (
          <a key={i} className="patro-slot" href={s.siteUrl} target="_blank" rel="noopener noreferrer">{conteudo}</a>
        ) : (
          <div key={i} className="patro-slot">{conteudo}</div>
        );
      })}
    </aside>
  );
}

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
  const busca = searchParams.get("busca");
  const { data: categories } = trpc.market.categories.useQuery();
  const { data: markets, isLoading, error } = trpc.market.list.useQuery(
    (categorySlug || busca) ? { categorySlug: categorySlug ?? undefined, q: busca ?? undefined } : undefined,
  );
  const { data: homeSponsors } = trpc.sponsor.getActiveHome.useQuery();
  const { data: featured } = trpc.market.featured.useQuery();

  return (
    <main className="page">
      {featured && (
        homeSponsors && homeSponsors.length > 0 ? (
          <div className="home-topo">
            <Destaque items={featured} />
            <PatroSlots items={homeSponsors} />
          </div>
        ) : (
          <Destaque items={featured} />
        )
      )}

      {busca && (
        <p className="hint-text" style={{ marginBottom: 12 }}>
          Resultado pra "{busca}"{markets ? ` — ${markets.length} mercado${markets.length === 1 ? "" : "s"}` : ""}
        </p>
      )}

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

      {isLoading && (
        <div className="market-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="market-tile-skel">
              <div className="skel-block" style={{ width: 26, height: 26, borderRadius: 7 }} />
              <div className="skel-block" style={{ width: "70%", height: 14 }} />
              <div className="skel-block" style={{ width: "90%", height: 14 }} />
              <div className="skel-block" style={{ width: "40%", height: 14, marginTop: "auto" }} />
            </div>
          ))}
        </div>
      )}
      {error && <p className="error-text">Não deu pra carregar os mercados agora.</p>}
      {markets && markets.length === 0 && (
        <div className="empty-state">
          <span className="emoji" aria-hidden="true">◆</span>
          <p className="hint-text">Ninguém disse nada ainda. Diga primeiro.</p>
        </div>
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
          ))}
        </div>
      )}
    </main>
  );
}
