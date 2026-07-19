import { useState } from "react";
import { trpc } from "../lib/trpc";
import { fmtPoints } from "../lib/format";

const DAY_OPTIONS = [7, 30, 90] as const;

const dayFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

export function AdminAudience() {
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(30);
  const { data: stats, isLoading } = trpc.pageViews.stats.useQuery({ days });

  const maxViews = stats ? Math.max(1, ...stats.daily.map((d) => d.views)) : 1;
  const avgPerDay = stats && stats.days > 0 ? stats.views / stats.days : 0;

  return (
    <div>
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: 0 }}>Audiência</h1>
        <p className="hint-text" style={{ marginTop: 8 }}>
          Analytics próprio, sem cookie e sem terceiro — visitante único é contado
          por um hash que muda todo dia, não identifica ninguém.
        </p>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="cat-tabs" style={{ marginBottom: 0, paddingBottom: 0, border: 0 }}>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d} type="button" className={`cat-tab ${days === d ? "on" : ""}`}
              onClick={() => setDays(d)}
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>

      {isLoading || !stats ? (
        <div className="card" style={{ marginTop: 20 }}><p className="hint-text">Carregando…</p></div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginTop: 20 }}>
            <div className="card">
              <span className="eyebrow">Visualizações</span>
              <p className="mono" style={{ fontSize: 28, fontWeight: 700, color: "var(--violeta)", margin: "6px 0 0" }}>
                {fmtPoints(stats.views)}
              </p>
            </div>
            <div className="card">
              <span className="eyebrow">Visitantes únicos</span>
              <p className="mono" style={{ fontSize: 28, fontWeight: 700, color: "var(--violeta)", margin: "6px 0 0" }}>
                {fmtPoints(stats.uniques)}
              </p>
            </div>
            <div className="card">
              <span className="eyebrow">Média por dia</span>
              <p className="mono" style={{ fontSize: 28, fontWeight: 700, color: "var(--violeta)", margin: "6px 0 0" }}>
                {fmtPoints(Math.round(avgPerDay))}
              </p>
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 16, margin: "0 0 16px" }}>Visualizações por dia</h2>
            {stats.daily.length === 0 ? (
              <p className="hint-text">Sem dados ainda.</p>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120 }}>
                {stats.daily.map((d) => (
                  <div
                    key={d.day} title={`${dayFmt.format(new Date(d.day))}: ${d.views} visualizações, ${d.uniques} únicos`}
                    style={{
                      flex: 1, minWidth: 2, height: `${Math.max(3, (d.views / maxViews) * 100)}%`,
                      background: "var(--violeta-2)", borderRadius: "2px 2px 0 0",
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginTop: 20 }}>
            <div className="card">
              <h2 style={{ fontFamily: "var(--serif)", fontSize: 16, margin: "0 0 12px" }}>Páginas mais vistas</h2>
              {stats.topPaths.length === 0 ? (
                <p className="hint-text">Sem dados ainda.</p>
              ) : (
                stats.topPaths.map((p) => (
                  <div key={p.path} className="admin-row">
                    <span className="titulo mono" style={{ fontSize: 13 }}>{p.path}</span>
                    <span className="badge">{fmtPoints(p.views)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="card">
              <h2 style={{ fontFamily: "var(--serif)", fontSize: 16, margin: "0 0 12px" }}>De onde vêm</h2>
              {stats.topReferrers.length === 0 ? (
                <p className="hint-text">Sem referências externas ainda.</p>
              ) : (
                stats.topReferrers.map((r) => (
                  <div key={r.referrerHost} className="admin-row">
                    <span className="titulo" style={{ fontSize: 13 }}>{r.referrerHost}</span>
                    <span className="badge">{fmtPoints(r.views)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
