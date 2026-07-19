import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";

export function Indices() {
  const { data: list, isLoading } = trpc.indexSeries.list.useQuery();

  return (
    <main className="page" style={{ maxWidth: 760, margin: "0 auto" }}>
      <span className="eyebrow">Dados abertos</span>
      <h1 style={{ fontSize: 26 }}>Índices citáveis</h1>
      <p className="hint-text" style={{ marginTop: 8, marginBottom: 20 }}>
        Séries públicas, calculadas em tempo real, com metodologia aberta — pra imprensa citar.
      </p>
      <div className="card">
        {isLoading ? (
          <p className="hint-text">Carregando…</p>
        ) : !list || list.length === 0 ? (
          <p className="hint-text">Nenhum índice publicado ainda.</p>
        ) : (
          list.map((idx) => (
            <Link key={idx.slug} to={`/indice/${idx.slug}`} className="admin-row" style={{ color: "inherit", textDecoration: "none" }}>
              <span className="titulo">
                {idx.title}
                {idx.groupTitle && <div className="meta">{idx.groupTitle}</div>}
              </span>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
