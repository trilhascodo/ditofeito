import { useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { logout } from "./lib/auth";
import { useAuth } from "./lib/useAuth";

const STAFF_ROLES = new Set(["ADMIN", "MODERATOR", "RESOLVER"]);

export function Layout() {
  const { user, isLoading, refresh } = useAuth();
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");

  async function onLogout() {
    await logout();
    refresh();
    navigate("/");
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = busca.trim();
    navigate(q ? `/?busca=${encodeURIComponent(q)}` : "/");
  }

  return (
    <>
      <header className="site-header">
        <div className="site-header-in">
          <Link to="/" className="logo">
            <img src="/logo.png" alt="DitoFeito" />
          </Link>
          <form className="site-search" onSubmit={onSearch} role="search">
            <input
              type="search" placeholder="Pesquisa Ditos" aria-label="Pesquisar mercados"
              value={busca} onChange={(e) => setBusca(e.target.value)}
            />
          </form>
          <nav className="site-nav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>Mercados</NavLink>
            <NavLink to="/ranking" className={({ isActive }) => (isActive ? "active" : "")}>Ranking</NavLink>
            {user && STAFF_ROLES.has(user.role) && (
              <NavLink to="/admin" className={({ isActive }) => (isActive ? "active" : "")}>Admin</NavLink>
            )}
            {user && user.role === "SPONSOR" && (
              <NavLink to="/patrocinador" className={({ isActive }) => (isActive ? "active" : "")}>Meu anúncio</NavLink>
            )}
          </nav>
          <div className="site-header-auth">
            {isLoading ? null : user ? (
              <>
                <Link to="/perfil" className="saldo">{user.displayName}</Link>
                <button className="link-btn" onClick={onLogout}>Sair</button>
              </>
            ) : (
              <>
                <Link to="/entrar">Entrar</Link>
                <Link to="/cadastro" className="btn-small">Cadastrar</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <Outlet />
      <footer className="site-footer">
        <div className="site-footer-in">
          <div className="site-footer-brand">
            <img src="/logo.png" alt="DitoFeito" />
            <p>
              Mercado de previsão por reputação. Pontos e reputação não têm valor
              monetário — não podem ser trocados, vendidos ou sacados.
            </p>
          </div>
          <nav className="site-footer-nav">
            <Link to="/">Mercados</Link>
            <Link to="/termos">Termos e Privacidade</Link>
          </nav>
        </div>
        <p className="site-footer-copy">© {new Date().getFullYear()} DitoFeito</p>
      </footer>
    </>
  );
}
