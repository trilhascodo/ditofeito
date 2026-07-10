import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { sharesForPoints, tradeCost } from "@ditofeito/core";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/useAuth";

const CORES = ["#5B4B8A", "#B3402E", "#1F7A5C", "#B8860B", "#0E7490", "#888780"];
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const pct = (p: number) => `${(p * 100).toFixed(p >= 0.1 ? 0 : 1)}%`;
const dataFmt = (d: Date | string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

function pathFromSeries(points: [number, number][], w: number, h: number, pad: number): string {
  if (points.length < 2) return "";
  return points
    .map(([t, p], i) => `${i ? "L" : "M"}${(pad + t * (w - 2 * pad)).toFixed(1)},${(h - p * h * 0.92 - pad).toFixed(1)}`)
    .join(" ");
}

export function MarketPage() {
  const { slug = "" } = useParams();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: market, isLoading, error } = trpc.market.get.useQuery({ slug }, { enabled: !!slug });
  const { data: positions } = trpc.user.myPositions.useQuery(undefined, { enabled: !!user });
  const tradeMutation = trpc.trade.execute.useMutation();

  const [selected, setSelected] = useState<string | null>(null);
  const [points, setPoints] = useState(50);
  const [showStamp, setShowStamp] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);

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

  const W = 640, H = 220, P = 8;

  return (
    <main className="page">
      <p className="eyebrow">{market.categoryName}</p>
      <h1>{market.title}</h1>
      <div className="meta">
        <span>Encerra em <span className="mono">{dataFmt(market.closeAt)}</span></span>
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
            <div className="legenda">
              {market.outcomes.map((o, k) => (
                <span key={o.id}>
                  <i className="dot" style={{ background: CORES[k % CORES.length] }} />
                  {o.label}
                </span>
              ))}
            </div>
          </div>

          <div className="card">
            {market.outcomes.map((o, k) => {
              const serie = o.series;
              const antes = serie.length >= 2 ? serie[serie.length - 2][1] : o.price;
              const d = o.price - antes;
              return (
                <div key={o.id} className={`out ${selected === o.id ? "sel" : ""}`}>
                  <span className="dot" style={{ background: CORES[k % CORES.length] }} />
                  <span className="nome">{o.label}</span>
                  {Math.abs(d) < 0.0005 ? (
                    <span className="var mono" style={{ color: "var(--grafite)" }}>—</span>
                  ) : (
                    <span className={`var mono ${d > 0 ? "up" : "down"}`}>
                      {d > 0 ? "▲" : "▼"} {(Math.abs(d) * 100).toFixed(1)}
                    </span>
                  )}
                  <span className="preco mono">{pct(o.price)}</span>
                  {canTrade && (
                    <button onClick={() => setSelected(o.id)} aria-label={`Prever ${o.label}`}>Prever</button>
                  )}
                </div>
              );
            })}
          </div>

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
                <div className="campo">
                  <label>Sua escolha</label>
                  <span className="sel-out">
                    {idx >= 0 ? market.outcomes[idx].label : "— selecione um outcome ao lado"}
                  </span>
                </div>
                <div className="campo">
                  <label htmlFor="pts">Pontos a comprometer</label>
                  <input
                    type="number" id="pts" min={1} max={1000} step={10}
                    value={points} onChange={(e) => setPoints(Number(e.target.value))}
                  />
                </div>
                {preview && (
                  <div className="preview">
                    <div className="row"><span>Posições que você recebe</span><b>{fmt(preview.shares)}</b></div>
                    <div className="row"><span>Probabilidade vai a</span><b>{pct(preview.priceAfter)}</b></div>
                    <div className="row"><span>Se acertar, recebe</span><b>{fmt(preview.shares)} pts</b></div>
                  </div>
                )}
                {tradeError && <p className="error-text">{tradeError}</p>}
                <button
                  className="btn" disabled={!preview || tradeMutation.isPending}
                  onClick={onRegistrar}
                >
                  {tradeMutation.isPending ? "Registrando…" : "Registrar previsão"}
                </button>
                {myPosition && (
                  <div className="posicao">
                    <div className="row"><span>Sua posição</span><b>{myPosition.outcomeLabel}</b></div>
                    <div className="row"><span>Posições</span><b>{fmt(myPosition.shares)}</b></div>
                    <div className="row"><span>Comprometido</span><b>{fmt(myPosition.costBasis)} pts</b></div>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      <div className={`carimbo ${showStamp ? "show" : ""}`} role="status">
        <div className="selo-big">DITO ✓<small>Registrado. Agora é esperar o feito.</small></div>
      </div>
    </main>
  );
}
