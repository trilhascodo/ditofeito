import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { pct, relativeClose } from "../lib/format";
import { pathFromSeries } from "../lib/chart";
import { SocialLinks, type SocialLinkItem } from "../lib/socialIcons";
import { MarketTile } from "../components/MarketTile";

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
  // Linhas de outcome: o líder (m.summary — SIM em BINARY, o mais provável em
  // MULTI, mesma regra do resto do produto) sempre em primeiro e destacado,
  // seguido de até 3 outros — substitui o antigo par "stat grande + pills
  // soltas" por uma lista única, mais parecida com o carrossel do Kalshi.
  const outros = m.outcomes.filter((o) => o.label !== m.summary?.label).slice(0, 3);
  const linhas = m.summary ? [{ ...m.summary, lead: true }, ...outros.map((o) => ({ ...o, lead: false }))] : [];

  return (
    <div className="destaque" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="destaque-top">
        <span className="eyebrow">{m.categoryName}</span>
        {items.length > 1 && (
          <div className="destaque-nav">
            <button type="button" aria-label="Destaque anterior"
                    onClick={() => setIdx((i) => (i - 1 + items.length) % items.length)}>‹</button>
            <span className="destaque-contador">{idx + 1} de {items.length}</span>
            <button type="button" aria-label="Próximo destaque"
                    onClick={() => setIdx((i) => (i + 1) % items.length)}>›</button>
          </div>
        )}
      </div>
      <Link to={`/m/${m.slug}`} className="destaque-card">
        <h2 className="destaque-titulo">{m.title}</h2>
        <div className="destaque-corpo">
          {linhas.length > 0 && (
            <div className="destaque-linhas">
              {linhas.map((o) => (
                <div key={o.label} className={`destaque-linha${o.lead ? " destaque-linha-lead" : ""}`}>
                  <span className="destaque-linha-dot" aria-hidden="true" />
                  <span className="destaque-linha-label">{o.label === "SIM" ? "chance de SIM" : o.label}</span>
                  <span className="destaque-linha-barra"><span style={{ width: pct(o.price) }} /></span>
                  <b className="mono destaque-linha-pct">{pct(o.price)}</b>
                </div>
              ))}
            </div>
          )}
          <svg viewBox="0 0 640 100" className="destaque-spark" preserveAspectRatio="none" aria-hidden="true">
            <line x1="0" y1="20" x2="640" y2="20" stroke="var(--linha)" strokeDasharray="2 4" />
            <line x1="0" y1="50" x2="640" y2="50" stroke="var(--linha)" strokeDasharray="2 4" />
            <line x1="0" y1="80" x2="640" y2="80" stroke="var(--linha)" strokeDasharray="2 4" />
            {path && <path d={path} fill="none" stroke="var(--violeta)" strokeWidth={3}
                            strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
        </div>
        <span className="hint-text">{relativeClose(m.closeAt)}</span>
      </Link>
    </div>
  );
}

interface HomeSponsor {
  label: string; sponsorName: string; logoUrl: string | null; siteUrl: string | null;
  creativeUrl: string | null;
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
        // Anunciante mandou a peça pronta (fundo+headline+CTA embutidos) —
        // exibe a arte cheia, com o rótulo sobreposto só por transparência
        // (identidade §1: nunca esconder que é publicidade).
        if (s.creativeUrl) {
          const img = <img className="patro-slot-creative-img" src={s.creativeUrl} alt={s.sponsorName} />;
          return (
            <div key={i} className="patro-slot patro-slot-creative">
              <span className="patro-slot-label">{s.label}</span>
              {s.siteUrl ? (
                <a className="patro-slot-main" href={s.siteUrl} target="_blank" rel="noopener noreferrer" aria-label={s.sponsorName}>
                  {img}
                </a>
              ) : img}
              <SocialLinks items={s.socialLinks} />
            </div>
          );
        }
        const conteudo = (
          <>
            <span className="patro-slot-label">{s.label}</span>
            {s.logoUrl && <img src={s.logoUrl} alt="" />}
            <b>{s.sponsorName}</b>
            {s.siteUrl && <span className="patro-slot-cta">Visitar site ↗</span>}
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

interface TrendingItem {
  slug: string; title: string; categoryName: string; label: string; price: number; delta: number;
}
interface MostVotedItem { slug: string; title: string; categoryName: string; voters: number }
interface NewestItem { slug: string; title: string; categoryName: string }

// Painel genérico de ranking na coluna lateral (tendências, mais votados,
// novos mercados) — mesma estrutura de card+lista, só muda o cabeçalho e o
// que aparece do lado direito de cada linha.
function SidePanelList<T extends { slug: string; title: string }>(
  { heading, items, badge }: { heading: string; items: T[]; badge: (item: T) => ReactNode },
) {
  if (items.length === 0) return null;
  return (
    <div className="card">
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 16, margin: "0 0 10px" }}>{heading}</h2>
      <div className="trending-list">
        {items.map((it) => (
          <Link key={it.slug} to={`/m/${it.slug}`} className="trending-row">
            <span className="trending-titulo">{it.title}</span>
            {badge(it)}
          </Link>
        ))}
      </div>
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  return (
    <span className={`var mono ${delta > 0 ? "up" : "down"}`}>
      {delta > 0 ? "▲" : "▼"} {(Math.abs(delta) * 100).toFixed(1)}
    </span>
  );
}

interface HomeLinkItem { id: string; title: string; url: string }

// "Links úteis" — abaixo dos anúncios na coluna lateral, mesma curadoria
// manual do .noticia (leitura relacionada do mercado): preenche o espaço que
// sobra quando a lateral é mais curta que o conteúdo principal, sem competir
// visualmente com os anúncios pagos (fica só depois deles, no fluxo normal).
function HomeLinks({ items }: { items: HomeLinkItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="card">
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 16, margin: "0 0 10px" }}>Links úteis</h2>
      {items.map((l) => (
        <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="noticia">
          {l.title}
        </a>
      ))}
    </div>
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
  const { data: trending } = trpc.market.trending.useQuery();
  const { data: mostVoted } = trpc.market.mostVoted.useQuery();
  const { data: newest } = trpc.market.newest.useQuery();
  const { data: homeLinks } = trpc.homeLinks.list.useQuery();

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

  // Conteúdo principal (slide + faixa + abas + grade) sempre no mesmo fluxo,
  // independente da coluna de anúncios lateral — se ela crescer (mais
  // patrocinadores), só a coluna dela estica, sem empurrar isso pra baixo
  // (ver home-N.pdf: a lateral é uma pilha vertical à parte, não fixada à
  // altura do slide).
  const mainContent = (
    <>
      {featured && <Destaque items={featured} />}
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
            <MarketTile key={item.m.slug} m={item.m} />
          ))}
        </div>
      )}
    </>
  );

  const hasSidebarAds = !!home && home.sidebar.length > 0;
  const hasSideContent = hasSidebarAds || !!trending?.length || !!mostVoted?.length
    || !!newest?.length || !!homeLinks?.length;

  return (
    <main className="page">
      {hasSideContent ? (
        <div className="home-layout">
          <div className="home-main">{mainContent}</div>
          <div className="home-side">
            {hasSidebarAds && <PatroSlots items={home.sidebar} />}
            <SidePanelList<TrendingItem>
              heading="Tendências" items={trending ?? []}
              badge={(it) => <DeltaBadge delta={it.delta} />}
            />
            <SidePanelList<MostVotedItem>
              heading="Mais votados" items={mostVoted ?? []}
              badge={(it) => <span className="badge">{it.voters} voto{it.voters === 1 ? "" : "s"}</span>}
            />
            <SidePanelList<NewestItem>
              heading="Novos mercados" items={newest ?? []}
              badge={(it) => <span className="badge">{it.categoryName}</span>}
            />
            <HomeLinks items={homeLinks ?? []} />
          </div>
        </div>
      ) : mainContent}
    </main>
  );
}
