import { Link } from "react-router-dom";
import { usePageMeta } from "../lib/head";

// Rota curinga: sem ela, /blog, /sobre e qualquer URL inventada devolviam a
// SPA em branco com HTTP 200 — o buscador lê isso como página válida e
// duplicada ("soft 404"). Aqui pelo menos o robots fica noindex e a pessoa
// tem pra onde ir. HTTP 200 continua (SPA servida pelo nginx), mas a página
// se declara não indexável.
export function NaoEncontrado() {
  usePageMeta({ title: "Página não encontrada", noindex: true });
  return (
    <main className="page-narrow">
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Não achamos essa página</h1>
        <p className="hint-text" style={{ marginBottom: 16 }}>
          O link pode estar errado ou o conteúdo saiu do ar.
        </p>
        <Link to="/" className="btn" style={{ display: "block", textAlign: "center" }}>Ver os mercados</Link>
      </div>
    </main>
  );
}
