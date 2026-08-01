import { useEffect, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { logout } from "./lib/auth";
import { useAuth } from "./lib/useAuth";
import { trpc } from "./lib/trpc";
import { NotificationBell } from "./components/NotificationBell";
import { PENDING_INVITE_KEY } from "./pages/EntrarGrupo";

const STAFF_ROLES = new Set(["ADMIN", "MODERATOR", "RESOLVER"]);

// Analytics próprio (page_views) — 1 track por mudança de rota da SPA, sem
// cookie e sem terceiro (visitorHash.ts cuida do hash no backend). Referrer
// só interessa na primeira carga (navegação interna não teria terceiro).
function usePageViewTracking() {
  const location = useLocation();
  const track = trpc.pageViews.track.useMutation();
  useEffect(() => {
    const referrerHost = (() => {
      try {
        const ref = document.referrer && new URL(document.referrer);
        return ref && ref.hostname !== window.location.hostname ? ref.hostname : undefined;
      } catch {
        return undefined;
      }
    })();
    track.mutate({ path: location.pathname, referrerHost });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
}

// Convite de grupo pra quem ainda não tinha conta (EntrarGrupo.tsx grava o
// código antes de mandar pro /cadastro): cadastro exige confirmar e-mail
// antes de logar, então a pessoa não necessariamente volta pra
// /grupos/entrar/:code — este efeito roda em toda a SPA e consome o convite
// pendente assim que a sessão vira autenticada, não importa por onde entrou
// (usuário/senha, Google, ou confirmação de e-mail).
function usePendingInviteAutoJoin(userId: string | undefined) {
  const navigate = useNavigate();
  const joinMut = trpc.groups.joinByCode.useMutation();
  useEffect(() => {
    if (!userId) return;
    const code = localStorage.getItem(PENDING_INVITE_KEY);
    if (!code) return;
    localStorage.removeItem(PENDING_INVITE_KEY);
    joinMut.mutateAsync({ code }).then((g) => navigate(`/grupos/${g.id}`)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}

export function Layout() {
  const { user, isLoading, refresh } = useAuth();
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  usePageViewTracking();
  usePendingInviteAutoJoin(user?.id);

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
            {user && (
              <NavLink to="/grupos" className={({ isActive }) => (isActive ? "active" : "")}>Grupos</NavLink>
            )}
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
                <NotificationBell />
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
            <Link to="/indices">Índices</Link>
            <Link to="/metodologia">Metodologia</Link>
            <Link to="/anuncie">Anuncie</Link>
            <Link to="/solicitar-mercado">Solicitar mercado</Link>
            <Link to="/termos">Termos e Privacidade</Link>
          </nav>
        </div>
        <p className="site-footer-copy">© {new Date().getFullYear()} DitoFeito</p>
      </footer>
    </>
  );
}
