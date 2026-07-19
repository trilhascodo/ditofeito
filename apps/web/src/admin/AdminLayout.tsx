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
  const { data: marketRequests } = trpc.marketRequests.list.useQuery(undefined, { enabled: staff });
  const { data: reportedComments } = trpc.moderation.listReportedComments.useQuery(undefined, { enabled: staff });

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
  const requestCount = marketRequests?.filter((r) => r.status === "NOVO").length ?? 0;
  const reportedCount = reportedComments?.length ?? 0;
  const hasPending = draftCount > 0 || overdueCount > 0 || candidateCount > 0 || suspiciousCount > 0
    || requestCount > 0 || reportedCount > 0;

  return (
    <main className="page">
      <nav className="admin-nav">
        <NavLink to="/admin/mercados" className={navClass}>Mercados</NavLink>
        <NavLink to="/admin/candidatos" className={navClass}>Candidatos</NavLink>
        <NavLink to="/admin/solicitacoes-mercado" className={navClass}>Solicitações</NavLink>
        <NavLink to="/admin/comentarios" className={navClass}>Comentários</NavLink>
        <NavLink to="/admin/suspeitas" className={navClass}>Contas suspeitas</NavLink>
        {user.role === "ADMIN" && <NavLink to="/admin/usuarios" className={navClass}>Usuários</NavLink>}
        {user.role === "ADMIN" && <NavLink to="/admin/audiencia" className={navClass}>Audiência</NavLink>}
        {user.role === "ADMIN" && <NavLink to="/admin/indices" className={navClass}>Índices</NavLink>}
        {user.role === "ADMIN" && <NavLink to="/admin/patrocinadores" className={navClass}>Patrocinadores</NavLink>}
        {user.role === "ADMIN" && <NavLink to="/admin/links-home" className={navClass}>Links da home</NavLink>}
        {user.role === "ADMIN" && <NavLink to="/admin/leads" className={navClass}>Leads</NavLink>}
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
          {[
            draftCount > 0 && <Link key="draft" to="/admin/mercados">{draftCount} rascunho{draftCount === 1 ? "" : "s"}</Link>,
            overdueCount > 0 && <Link key="overdue" to="/admin/mercados">{overdueCount} vencido{overdueCount === 1 ? "" : "s"}</Link>,
            candidateCount > 0 && (
              <Link key="candidates" to="/admin/candidatos">{candidateCount} candidato{candidateCount === 1 ? "" : "s"} pendente{candidateCount === 1 ? "" : "s"}</Link>
            ),
            requestCount > 0 && (
              <Link key="requests" to="/admin/solicitacoes-mercado">{requestCount} solicitaç{requestCount === 1 ? "ão" : "ões"} de mercado</Link>
            ),
            reportedCount > 0 && (
              <Link key="reported" to="/admin/comentarios">{reportedCount} comentário{reportedCount === 1 ? "" : "s"} denunciado{reportedCount === 1 ? "" : "s"}</Link>
            ),
            suspiciousCount > 0 && (
              <Link key="suspicious" to="/admin/suspeitas">{suspiciousCount} cluster{suspiciousCount === 1 ? "" : "s"} suspeito{suspiciousCount === 1 ? "" : "s"}</Link>
            ),
          ].filter(Boolean).map((el, i) => <span key={i}>{i > 0 && " · "}{el}</span>)}
        </p>
      )}
      <Outlet context={{ role: user.role }} />
    </main>
  );
}
