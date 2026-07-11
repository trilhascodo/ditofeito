import { useState, type FormEvent } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
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
            Dito<b>Feito</b><span className="selo">✓</span>
          </Link>
          <form className="site-search" onSubmit={onSearch} role="search">
            <input
              type="search" placeholder="Pesquisa Ditos" aria-label="Pesquisar mercados"
              value={busca} onChange={(e) => setBusca(e.target.value)}
            />
          </form>
          <nav className="site-nav">
            <Link to="/">Mercados</Link>
            {user && STAFF_ROLES.has(user.role) && <Link to="/admin">Admin</Link>}
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
    </>
  );
}
