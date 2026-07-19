import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { sharesForPoints, tradeCost } from "@ditofeito/core";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/useAuth";
import { fmtPoints, pct, relativeClose, dataFmt } from "../lib/format";
import { pathFromSeries } from "../lib/chart";
import { SocialLinks } from "../lib/socialIcons";

const CORES = ["#4F2E99", "#C93A1F", "#0F8F5F", "#B8860B", "#0E7490", "#888780"];

function priceDelta(o: { price: number; series: [number, number][] }): number {
  const serie = o.series;
  const antes = serie.length >= 2 ? serie[serie.length - 2][1] : o.price;
  return o.price - antes;
}

function VarBadge({ d }: { d: number }) {
  if (Math.abs(d) < 0.0005) return <span className="var mono" style={{ color: "var(--grafite)" }}>—</span>;
  return (
    <span className={`var mono ${d > 0 ? "up" : "down"}`}>
      {d > 0 ? "▲" : "▼"} {(Math.abs(d) * 100).toFixed(1)}
    </span>
  );
}

const commentTimeFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

interface CommentItem {
  id: string; body: string; createdAt: string; authorRepSnapshot: number | null;
  positionSnapshot: { outcomeLabel: string; shares: number; priceAtPost: number }[];
  author: { handle: string; displayName: string; avatarUrl: string | null };
}

// Comentários — versão sem thread. O que diferencia de rede social genérica:
// cada comentário carrega, congelada no momento do post, a posição do autor
// (quantas posições e em que preço) e o histórico de acerto (Brier, menor =
// melhor) — "put your money where your mouth is" sustenta grupo A desafiando
// grupo B, em vez de opinião solta.
function Comment({ c }: { c: CommentItem }) {
  return (
    <div className="comment">
      <span className="ranking-avatar">
        {c.author.avatarUrl ? <img src={c.author.avatarUrl} alt="" /> : c.author.displayName[0]?.toUpperCase()}
      </span>
      <div className="comment-body-wrap">
        <div className="comment-head">
          <span className="comment-author">{c.author.displayName}</span>
          <span className="hint-text">@{c.author.handle}</span>
          {c.authorRepSnapshot !== null && (
            <span className="hint-text mono">brier {c.authorRepSnapshot.toFixed(2)}</span>
          )}
          <span className="comment-time">{commentTimeFmt.format(new Date(c.createdAt))}</span>
        </div>
        {c.positionSnapshot.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {c.positionSnapshot.map((p, i) => (
              <span key={i} className="comment-position">
                {fmtPoints(p.shares)} em {p.outcomeLabel} ({pct(p.priceAtPost)})
              </span>
            ))}
          </div>
        )}
        <p className="comment-body">{c.body}</p>
      </div>
    </div>
  );
}

export function MarketPage() {
  const { slug = "" } = useParams();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: market, isLoading, error } = trpc.market.get.useQuery({ slug }, { enabled: !!slug });
  const { data: positions } = trpc.user.myPositions.useQuery(undefined, { enabled: !!user });
  const { data: sponsorship } = trpc.sponsor.getActiveForMarket.useQuery(
    { marketId: market?.id ?? "" }, { enabled: !!market },
  );
  const { data: news } = trpc.news.list.useQuery(
    { marketId: market?.id ?? "" }, { enabled: !!market },
  );
  const { data: comments } = trpc.comments.list.useQuery(
    { marketId: market?.id ?? "" }, { enabled: !!market },
  );
  const tradeMutation = trpc.trade.execute.useMutation();
  const commentMutation = trpc.comments.create.useMutation();

  const [selected, setSelected] = useState<string | null>(null);
  const [points, setPoints] = useState(50);
  const [showStamp, setShowStamp] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);

  useEffect(() => {
    if (!market) return;
    document.title = `${market.title} — DitoFeito`;
    return () => { document.title = "DitoFeito — pode escrever"; };
  }, [market?.title]);

  if (isLoading) return <main className="page"><p className="hint-text">Carregando…</p></main>;
  if (error || !market) return <main className="page"><p className="error-text">Mercado não encontrado.</p></main>;

  const myPosition = positions?.find((p) => p.marketSlug === market.slug);

  // Reconstrói q a partir do preço: como preço = softmax(q/b) e Σpreço = 1,
  // q'_i = b·ln(p_i) reproduz exatamente os mesmos preços (softmax é
  // invariante a deslocamento constante) — evita expor q bruto na API só
  // pra ter o preview client-side com a MESMA matemática do servidor.
  const q = market.outcomes.map((o) => market.liquidityB * Math.log(Math.max(o.price, 1e-9)));
  const idx = selected ? market.outcomes.findIndex((o) => o.id === selected) : -1;

  let preview: { shares: number; priceAfter: number } | null = null;
  if (idx >= 0 && points > 0) {
    const shares = sharesForPoints(q, market.liquidityB, idx, points);
    const { pricesAfter } = tradeCost(q, market.liquidityB, idx, shares);
    preview = { shares, priceAfter: pricesAfter[idx] };
  }

  const canTrade = market.status === "OPEN";

  async function onRegistrar() {
    if (!selected || points < 1) return;
    setTradeError(null);
    try {
      await tradeMutation.mutateAsync({ marketId: market!.id, outcomeId: selected, side: "BUY", amount: points });
      await Promise.all([
        utils.market.get.invalidate({ slug }),
        utils.user.myPositions.invalidate(),
        utils.user.me.invalidate(),
      ]);
      setShowStamp(true);
      setTimeout(() => setShowStamp(false), 1400);
    } catch (err) {
      setTradeError(err instanceof Error ? err.message : "Não foi possível registrar a previsão");
    }
  }

  async function onPostComment() {
    const body = commentBody.trim();
    if (!body) return;
    setCommentError(null);
    try {
      await commentMutation.mutateAsync({ marketId: market!.id, body });
      setCommentBody("");
      await utils.comments.list.invalidate({ marketId: market!.id });
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Não foi possível publicar o comentário");
    }
  }

  const W = 640, H = 220, P = 8;
  const simIdx = market.type === "BINARY" ? market.outcomes.findIndex((o) => o.label === "SIM") : -1;
  const naoIdx = market.type === "BINARY" ? market.outcomes.findIndex((o) => o.label === "NÃO") : -1;

  return (
    <main className="page">
      <Link to={`/?categoria=${market.categorySlug}`} className="eyebrow" style={{ display: "block" }}>
        {market.categoryName}
      </Link>
      <h1>{market.title}</h1>
      <div className="meta">
        <span>{relativeClose(market.closeAt)} <span className="mono">· {dataFmt(market.closeAt)}</span></span>
        <span>Resolve por <span className="mono">{market.resolutionSource}</span></span>
      </div>
      <p className="regras">{market.resolutionCriteria}</p>

      <div className="grid">
        <div>
          <div className="card">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
                 aria-label="Histórico de probabilidades" style={{ width: "100%", height: 220, display: "block" }}>
              {[0.25, 0.5, 0.75].map((y) => (
                <line key={y} x1={0} x2={W} y1={H - y * H} y2={H - y * H} stroke="#E3DDD0" strokeWidth={1} />
              ))}
              {market.outcomes.map((o, k) => {
                const path = pathFromSeries(o.series, W, H, P);
                if (!path) return null;
                return (
                  <path key={o.id} d={path} fill="none" stroke={CORES[k % CORES.length]}
                        strokeWidth={k === 0 ? 3 : 2} opacity={o.isCatchall ? 0.45 : 0.95} />
                );
              })}
            </svg>
            {market.type === "MULTI" && (
              <div className="legenda">
                {market.outcomes.map((o, k) => (
                  <span key={o.id}>
                    <i className="dot" style={{ background: CORES[k % CORES.length] }} />
                    {o.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {market.type === "BINARY" && simIdx >= 0 && naoIdx >= 0 ? (
            <div className="card binary-headline">
              <div className="binary-pct">{pct(market.outcomes[simIdx].price)}</div>
              <div className="binary-pct-label">
                chance de <b>SIM</b> <VarBadge d={priceDelta(market.outcomes[simIdx])} />
              </div>
              {canTrade && (
                <div className="binary-pills">
                  <button
                    className={`pill-outcome ${selected === market.outcomes[simIdx].id ? "sel" : ""}`}
                    onClick={() => setSelected(market.outcomes[simIdx].id)}
                  >
                    Prever SIM<b>{pct(market.outcomes[simIdx].price)}</b>
                  </button>
                  <button
                    className={`pill-outcome ${selected === market.outcomes[naoIdx].id ? "sel" : ""}`}
                    onClick={() => setSelected(market.outcomes[naoIdx].id)}
                  >
                    Prever NÃO<b>{pct(market.outcomes[naoIdx].price)}</b>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="card">
              {market.outcomes.map((o, k) => (
                <div key={o.id} className={`out ${selected === o.id ? "sel" : ""}`}>
                  <span className="dot" style={{ background: CORES[k % CORES.length] }} />
                  <span className="nome">{o.label}</span>
                  <VarBadge d={priceDelta(o)} />
                  <span className="preco mono">{pct(o.price)}</span>
                  {canTrade && (
                    <button onClick={() => setSelected(o.id)} aria-label={`Prever ${o.label}`}>Prever</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {news && news.length > 0 && (
            <div className="card" style={{ marginTop: 20 }}>
              <h2 style={{ fontFamily: "var(--serif)", fontSize: 16, margin: "0 0 10px" }}>Leitura relacionada</h2>
              {news.map((n) => (
                <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer" className="noticia">
                  {n.title}
                </a>
              ))}
            </div>
          )}

          {market.isElectoral && (
            <p className="disc">
              Agregado de opiniões de participantes. Não é pesquisa eleitoral (Lei 9.504/97).
              Aqui não existe dinheiro: pontos e reputação não têm valor monetário e não podem
              ser trocados, vendidos ou sacados.
            </p>
          )}
        </div>

        <aside className="painel">
          <div className="card">
            {!user ? (
              <>
                <h2>O que você diz?</h2>
                <p className="sub">Entre para registrar sua previsão.</p>
                <Link to="/entrar" className="btn" style={{ display: "block", textAlign: "center" }}>Entrar</Link>
              </>
            ) : !canTrade ? (
              <>
                <h2>O que você diz?</h2>
                <p className="sub">Esse mercado não está mais aberto pra novas previsões.</p>
              </>
            ) : (
              <>
                <h2>O que você diz?</h2>
                <p className="sub">Registre sua previsão. Se o feito confirmar o dito, sua reputação sobe.</p>
                {idx >= 0 ? (
                  <div className="painel-sel">
                    <span className="nome">{market.outcomes[idx].label}</span>
                    <span className="preco">{pct(market.outcomes[idx].price)}</span>
                  </div>
                ) : (
                  <div className="campo">
                    <label>Sua escolha</label>
                    <span className="sel-out">— selecione um outcome ao lado</span>
                  </div>
                )}
                <div className="campo">
                  <label htmlFor="pts">Pontos a comprometer</label>
                  <input
                    type="number" id="pts" name="pontos" autoComplete="off" min={1} max={1000} step={10}
                    value={points} onChange={(e) => setPoints(Number(e.target.value))}
                  />
                </div>
                {preview && (
                  <div className="preview">
                    <div className="row"><span>Posições que você recebe</span><b>{fmtPoints(preview.shares)}</b></div>
                    <div className="row"><span>Probabilidade vai a</span><b>{pct(preview.priceAfter)}</b></div>
                    <div className="row"><span>Se acertar, recebe</span><b>{fmtPoints(preview.shares)} pts</b></div>
                  </div>
                )}
                {tradeError && <p className="error-text" aria-live="polite">{tradeError}</p>}
                <button
                  className="btn" disabled={!preview || tradeMutation.isPending}
                  onClick={onRegistrar}
                >
                  {tradeMutation.isPending ? "Registrando…" : "Registrar previsão"}
                </button>
                {myPosition && (
                  <div className="posicao">
                    <div className="row"><span>Sua posição</span><b>{myPosition.outcomeLabel}</b></div>
                    <div className="row"><span>Posições</span><b>{fmtPoints(myPosition.shares)}</b></div>
                    <div className="row"><span>Comprometido</span><b>{fmtPoints(myPosition.costBasis)} pts</b></div>
                  </div>
                )}
              </>
            )}
          </div>

          {sponsorship && (
            <div className="patrocinio">
              {sponsorship.siteUrl ? (
                <a className="patrocinio-main" href={sponsorship.siteUrl} target="_blank" rel="noopener noreferrer">
                  {sponsorship.logoUrl && <img src={sponsorship.logoUrl} alt="" height={20} style={{ width: "auto", maxWidth: 80 }} />}
                  <span>{sponsorship.label} <b>{sponsorship.sponsorName}</b></span>
                </a>
              ) : (
                <>
                  {sponsorship.logoUrl && <img src={sponsorship.logoUrl} alt="" height={20} style={{ width: "auto", maxWidth: 80 }} />}
                  <span>{sponsorship.label} <b>{sponsorship.sponsorName}</b></span>
                </>
              )}
              <SocialLinks items={sponsorship.socialLinks} />
            </div>
          )}
        </aside>
      </div>

      <div className="card" style={{ marginTop: 28, maxWidth: 720 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 14px" }}>
          Comentários{comments && comments.length > 0 ? ` (${comments.length})` : ""}
        </h2>
        {user ? (
          <div style={{ marginBottom: 20 }}>
            <textarea
              value={commentBody} onChange={(e) => setCommentBody(e.target.value)}
              placeholder="O que você acha desse mercado?" rows={3} maxLength={5000}
            />
            {commentError && <p className="error-text">{commentError}</p>}
            <button
              className="btn-outline" style={{ marginTop: 8, width: "auto" }}
              onClick={onPostComment} disabled={!commentBody.trim() || commentMutation.isPending}
            >
              {commentMutation.isPending ? "Publicando…" : "Comentar"}
            </button>
          </div>
        ) : (
          <p className="hint-text" style={{ marginBottom: 20 }}>
            <Link to="/entrar">Entre</Link> pra comentar.
          </p>
        )}
        {!comments || comments.length === 0 ? (
          <p className="hint-text">Nenhum comentário ainda. Seja o primeiro a dizer o que pensa.</p>
        ) : (
          <div className="comment-list">
            {comments.map((c) => <Comment key={c.id} c={c} />)}
          </div>
        )}
      </div>

      <div className={`carimbo ${showStamp ? "show" : ""}`} role="status">
        <div className="selo-big">DITO ✓<small>Registrado. Agora é esperar o feito.</small></div>
      </div>
    </main>
  );
}
