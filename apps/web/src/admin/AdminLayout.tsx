import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/useAuth";
import { trpc } from "../lib/trpc";

const STAFF_ROLES = new Set(["ADMIN", "MODERATOR", "RESOLVER"]);
const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : "");

export function AdminLayout() {
  const { user, isLoading } = useAuth();
  const staff = !!user && STAFF_ROLES.has(user.role);
  const { data: markets } = trpc.admin.listMarkets.useQuery(undefined, { enabled: staff });
  const { data: pendingCandidates } = trpc.candidate.list.useQuery(
    { status: "PRE_ANUNCIADO" }, { enabled: staff },
  );
  const { data: suspiciousClusters } = trpc.moderation.listSuspiciousAccounts.useQuery(
    undefined, { enabled: staff },
  );

  if (isLoading) return <main className="page"><p className="hint-text">Carregando…</p></main>;

  if (!user || !staff) {
    return (
      <main className="page-narrow">
        <div className="card">
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Sem permissão</h1>
          <p className="hint-text">Essa área é só pra moderação/administração.</p>
        </div>
      </main>
    );
  }

  const draftCount = markets?.filter((m) => m.status === "DRAFT").length ?? 0;
  const overdueCount = markets?.filter((m) => m.overdue).length ?? 0;
  const candidateCount = pendingCandidates?.length ?? 0;
  const suspiciousCount = suspiciousClusters?.length ?? 0;
  const hasPending = draftCount > 0 || overdueCount > 0 || candidateCount > 0 || suspiciousCount > 0;

  return (
    <main className="page">
      <nav className="admin-nav">
        <NavLink to="/admin/mercados" className={navClass}>Mercados</NavLink>
        <NavLink to="/admin/candidatos" className={navClass}>Candidatos</NavLink>
        <NavLink to="/admin/suspeitas" className={navClass}>Contas suspeitas</NavLink>
        {user.role === "ADMIN" && <NavLink to="/admin/patrocinadores" className={navClass}>Patrocinadores</NavLink>}
        {user.role === "ADMIN" && <NavLink to="/admin/links-home" className={navClass}>Links da home</NavLink>}
        {user.role === "ADMIN" && <NavLink to="/admin/email" className={navClass}>E-mail</NavLink>}
        {user.role === "ADMIN" && (
          <Link to="/admin/mercados/novo" className="btn-small" style={{ marginLeft: "auto" }}>
            + Novo mercado
          </Link>
        )}
      </nav>
      {hasPending && (
        <p className="hint-text" style={{ marginBottom: 20 }}>
          Pendências:{" "}
          {draftCount > 0 && <Link to="/admin/mercados">{draftCount} rascunho{draftCount === 1 ? "" : "s"}</Link>}
          {draftCount > 0 && (overdueCount > 0 || candidateCount > 0) && " · "}
          {overdueCount > 0 && <Link to="/admin/mercados">{overdueCount} vencido{overdueCount === 1 ? "" : "s"}</Link>}
          {overdueCount > 0 && candidateCount > 0 && " · "}
          {candidateCount > 0 && (
            <Link to="/admin/candidatos">{candidateCount} candidato{candidateCount === 1 ? "" : "s"} pendente{candidateCount === 1 ? "" : "s"}</Link>
          )}
          {(draftCount > 0 || overdueCount > 0 || candidateCount > 0) && suspiciousCount > 0 && " · "}
          {suspiciousCount > 0 && (
            <Link to="/admin/suspeitas">{suspiciousCount} cluster{suspiciousCount === 1 ? "" : "s"} suspeito{suspiciousCount === 1 ? "" : "s"}</Link>
          )}
        </p>
      )}
      <Outlet context={{ role: user.role }} />
    </main>
  );
}
