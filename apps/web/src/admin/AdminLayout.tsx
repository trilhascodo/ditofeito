import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../lib/useAuth";

const STAFF_ROLES = new Set(["ADMIN", "MODERATOR", "RESOLVER"]);

export function AdminLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <main className="page"><p className="hint-text">Carregando…</p></main>;

  if (!user || !STAFF_ROLES.has(user.role)) {
    return (
      <main className="page-narrow">
        <div className="card">
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Sem permissão</h1>
          <p className="hint-text">Essa área é só pra moderação/administração.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <nav className="admin-nav">
        <Link to="/admin/mercados">Mercados</Link>
        <Link to="/admin/candidatos">Candidatos</Link>
        {user.role === "ADMIN" && <Link to="/admin/patrocinadores">Patrocinadores</Link>}
        {user.role === "ADMIN" && (
          <Link to="/admin/mercados/novo" className="btn-small" style={{ marginLeft: "auto" }}>
            + Novo mercado
          </Link>
        )}
      </nav>
      <Outlet context={{ role: user.role }} />
    </main>
  );
}
