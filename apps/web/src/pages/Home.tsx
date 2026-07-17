import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { pct, relativeClose } from "../lib/format";
import { pathFromSeries } from "../lib/chart";
import { SocialLinks, type SocialLinkItem } from "../lib/socialIcons";

const STATUS_LABEL: Record<string, string> = {
  CLOSED: "ENCERRADO", RESOLVED: "RESOLVIDO", VOIDED: "ANULADO",
};

interface FeaturedMarket {
  slug: string; title: string; type: string; closeAt: string; categoryName: string;
  summary: { label: string; price: number } | null;
  series: [number, number][];
  outcomes: { label: string; price: number }[];
}

// Slide de destaque (layout inspirado no carrossel do Polymarket — só a
// estrutura: 1 card grande por vez + navegação. Sem spread/combo/alavancagem,
// sem "$volume" — número é ponto e "chance de SIM" no nosso vocabulário).
const DESTAQUE_INTERVAL_MS = 6000;

function Destaque({ items }: { items: FeaturedMarket[] }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  // Timeout (não interval) que se rearma a cada mudança de idx — assim um
  // clique manual reinicia a contagem em vez de brigar com o próximo tick
  // automático. Pausa no hover e respeita prefers-reduced-motion.
  useEffect(() => {
    if (items.length <= 1 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % items.length), DESTAQUE_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [idx, items.length, paused]);

  if (items.length === 0) return null;
  const m = items[idx % items.length];
  const path = pathFromSeries(m.series, 640, 100, 4);
  // Mini-ranking: os outcomes que não são o líder já mostrado no stat grande
  // (até 3) — preenche o espaço vazio ao lado da sparkline com informação
  // real em vez de decoração.
  const outros = m.outcomes.filter((o) => o.label !== m.summary?.label).slice(0, 3);

  return (
    <div className="destaque" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
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
        {outros.length > 0 && (
          <div className="destaque-ranking">
            {outros.map((o) => (
              <span key={o.label} className="destaque-ranking-pill">
                {o.label} <b>{pct(o.price)}</b>
              </span>
            ))}
          </div>
        )}
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
  socialLinks: SocialLinkItem[];
}

// Até 5 espaços de publicidade ao lado do destaque (layout.pdf — coluna
// lateral empilhada, não mais faixa única embaixo do grid). Só renderiza o
// que tiver patrocínio ativo — sem caixa vazia "espaço disponível".
// Nomes de classe em português de propósito: "ad-slot" em inglês cai nos
// filtros genéricos de ad blocker (escondia o bloco inteiro no desktop).
// O <div> externo nunca é um link (HTML não permite <a> aninhado) — o link
// pro site do patrocinador fica só no .patro-slot-main interno, e os ícones
// de rede social ficam como irmãos, fora do link principal.
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
        return (
          <div key={i} className="patro-slot">
            {s.siteUrl ? (
              <a className="patro-slot-main" href={s.siteUrl} target="_blank" rel="noopener noreferrer">{conteudo}</a>
            ) : conteudo}
            <SocialLinks items={s.socialLinks} />
          </div>
        );
      })}
    </aside>
  );
}

// Faixa horizontal de anúncio, abaixo do destaque — segunda superfície de
// publicidade (além da coluna lateral), formato compacto pra não competir
// com o carrossel em altura.
function PatroFaixa({ items }: { items: HomeSponsor[] }) {
  if (items.length === 0) return null;
  return (
    <div className="patro-faixa">
      {items.map((s, i) => {
        const conteudo = (
          <>
            {s.logoUrl && <img src={s.logoUrl} alt="" />}
            <span>{s.label} <b>{s.sponsorName}</b></span>
          </>
        );
        return (
          <div key={i} className="patro-faixa-item">
            {s.siteUrl ? (
              <a className="patro-faixa-main" href={s.siteUrl} target="_blank" rel="noopener noreferrer">{conteudo}</a>
            ) : conteudo}
            <SocialLinks items={s.socialLinks} />
          </div>
        );
      })}
    </div>
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

// Terceira superfície de anúncio: card nativo intercalado na grade de
// mercados (Home()). Rótulo "PUBLICIDADE" explícito — transparência sobre
// o que é conteúdo vs. anúncio importa pra confiança do produto (mesmo
// princípio do rótulo "Apresentado por" nos cards de mercado patrocinado).
function MarketTileAd({ ad }: { ad: HomeSponsor }) {
  const conteudo = (
    <>
      <span className="market-tile-ad-label">Publicidade</span>
      {ad.logoUrl && <img src={ad.logoUrl} alt="" style={{ maxHeight: 32, width: "auto", maxWidth: "100%", objectFit: "contain" }} />}
      <b>{ad.sponsorName}</b>
    </>
  );
  return (
    <div className="market-tile market-tile-ad">
      {ad.siteUrl ? (
        <a className="market-tile-ad-main" href={ad.siteUrl} target="_blank" rel="noopener noreferrer">{conteudo}</a>
      ) : conteudo}
      <SocialLinks items={ad.socialLinks} />
    </div>
  );
}

export function Home() {
  const [searchParams] = useSearchParams();
  const categorySlug = searchParams.get("categoria");
  const busca = searchParams.get("busca");
  const { data: categories } = trpc.market.categories.useQuery();
  const { data: markets, isLoading, error } = trpc.market.list.useQuery(
    (categorySlug || busca) ? { categorySlug: categorySlug ?? undefined, q: busca ?? undefined } : undefined,
  );
  const { data: home } = trpc.sponsor.getActiveHome.useQuery();
  const { data: featured } = trpc.market.featured.useQuery();

  // Anúncio nativo intercalado a cada 6 mercados reais — só se a lista for
  // grande o bastante pra não deixar o anúncio dominar (plano de mais
  // espaços de propaganda, sem virar a maioria do conteúdo).
  const gridAds = home?.grid ?? [];
  const gridItems: ({ kind: "market"; m: NonNullable<typeof markets>[number] } | { kind: "ad"; ad: HomeSponsor; key: string })[] = [];
  if (markets) {
    let adCount = 0;
    markets.forEach((m, i) => {
      gridItems.push({ kind: "market", m });
      if (gridAds.length > 0 && markets.length >= 6 && (i + 1) % 6 === 0) {
        gridItems.push({ kind: "ad", ad: gridAds[adCount % gridAds.length], key: `ad-${i}` });
        adCount++;
      }
    });
  }

  return (
    <main className="page">
      {featured && (
        home && home.sidebar.length > 0 ? (
          <div className="home-topo">
            <Destaque items={featured} />
            <PatroSlots items={home.sidebar} />
          </div>
        ) : (
          <Destaque items={featured} />
        )
      )}
      <PatroFaixa items={home?.banner ?? []} />

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
          {gridItems.map((item) => item.kind === "ad" ? (
            <MarketTileAd key={item.key} ad={item.ad} />
          ) : (
            <Link key={item.m.slug} to={`/m/${item.m.slug}`} className="market-tile">
              <div className="market-tile-top">
                <span className="market-tile-icon">{CATEGORY_EMOJI[item.m.categorySlug] ?? FALLBACK_EMOJI}</span>
                <span className="market-tile-category">{item.m.categoryName}</span>
                {item.m.status !== "OPEN" && (
                  <span className="badge" style={{ marginLeft: "auto" }}>
                    {STATUS_LABEL[item.m.status] ?? item.m.status}
                  </span>
                )}
              </div>
              <h3 className="market-tile-title">{item.m.title}</h3>
              <div className="market-tile-bottom">
                <span className="hint-text">{relativeClose(item.m.closeAt)}</span>
                {item.m.summary && (
                  <span className="market-tile-price">
                    <small>{item.m.summary.label === "SIM" ? "chance de SIM" : item.m.summary.label}</small>
                    <b className="mono">{pct(item.m.summary.price)}</b>
                  </span>
                )}
              </div>
              {item.m.sponsor && (
                <div className="market-tile-sponsor">
                  {item.m.sponsor.logoUrl && <img src={item.m.sponsor.logoUrl} alt="" height={14} style={{ width: "auto", maxWidth: 48 }} />}
                  {item.m.sponsor.label} <b>{item.m.sponsor.name}</b>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
