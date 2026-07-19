import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { pct } from "../lib/format";

export function Indice() {
  const { slug = "" } = useParams();
  const { data: idx, isLoading, error } = trpc.indexSeries.get.useQuery({ slug }, { enabled: !!slug });

  useEffect(() => {
    if (!idx) return;
    document.title = `${idx.title} — DitoFeito`;
    return () => { document.title = "DitoFeito — pode escrever"; };
  }, [idx?.title]);

  if (isLoading) return <main className="page"><p className="hint-text">Carregando…</p></main>;
  if (error || !idx) return <main className="page"><p className="error-text">Índice não encontrado.</p></main>;

  const c = idx.current;

  return (
    <main className="page" style={{ maxWidth: 760, margin: "0 auto" }}>
      <span className="eyebrow">Índice DitoFeito</span>
      <h1 style={{ fontSize: 26 }}>{idx.title}</h1>

      {!c ? (
        <p className="hint-text" style={{ marginTop: 16 }}>Esse índice ainda não tem dados.</p>
      ) : (
        <>
          <div className="card" style={{ marginTop: 20 }}>
            <div className="destaque-linhas" style={{ width: "100%" }}>
              {c.values.filter((v) => !v.isCatchall).map((v, i) => (
                <div key={v.label} className={`destaque-linha${i === 0 ? " destaque-linha-lead" : ""}`}>
                  <span className="destaque-linha-dot" aria-hidden="true" />
                  <span className="destaque-linha-label">{v.label}</span>
                  <span className="destaque-linha-barra"><span style={{ width: pct(v.price) }} /></span>
                  <b className="mono destaque-linha-pct">{pct(v.price)}</b>
                </div>
              ))}
            </div>
            <p className="hint-text" style={{ marginTop: 16, marginBottom: 0 }}>
              Calculado em tempo real a partir de <Link to={`/m/${c.marketSlug}`}>{c.marketTitle}</Link>.
              {c.marketStatus !== "OPEN" && " Mercado encerrado — valores finais."}
            </p>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 16, margin: "0 0 10px" }}>Metodologia</h2>
            <p style={{ fontSize: 14, color: "var(--tinta)", margin: 0 }}>{idx.methodology.description}</p>
          </div>

          <div className="card" style={{ marginTop: 20, borderStyle: "dashed" }}>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 16, margin: "0 0 8px" }}>Como citar</h2>
            <p style={{ fontSize: 14, color: "var(--tinta)", margin: 0 }}>
              "Segundo o {idx.title} do DitoFeito, {c.values[0]?.label} tem {pct(c.values[0]?.price ?? 0)} de
              chance — dado agregado de participantes, não pesquisa eleitoral registrada."
            </p>
          </div>
        </>
      )}
    </main>
  );
}
