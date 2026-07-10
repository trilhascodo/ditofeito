import { Link, Outlet, useNavigate } from "react-router-dom";
import { logout } from "./lib/auth";
import { useAuth } from "./lib/useAuth";

export function Layout() {
  const { user, isLoading, refresh } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    refresh();
    navigate("/");
  }

  return (
    <>
      <header className="site-header">
        <div className="site-header-in">
          <Link to="/" className="logo">
            Dito<b>Feito</b><span className="selo">✓</span>
          </Link>
          <nav className="site-nav">
            <Link to="/">Mercados</Link>
          </nav>
          <div className="site-header-auth">
            {isLoading ? null : user ? (
              <>
                <span className="saldo">{user.displayName}</span>
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
