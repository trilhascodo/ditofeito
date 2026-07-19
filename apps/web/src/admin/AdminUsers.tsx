import { useState } from "react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/useAuth";
import { fmtPoints } from "../lib/format";

const ROLE_LABEL: Record<string, string> = {
  USER: "Usuário", MODERATOR: "Moderador", RESOLVER: "Resolvedor", ADMIN: "Admin", SPONSOR: "Anunciante",
};
const ASSIGNABLE_ROLES = ["USER", "MODERATOR", "RESOLVER", "ADMIN"] as const;

const dtDisplay = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export function AdminUsers() {
  const { user: me } = useAuth();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const { data: users, isLoading } = trpc.moderation.listUsers.useQuery({ search: search.trim() || undefined });
  const banUser = trpc.moderation.banUser.useMutation();
  const unbanUser = trpc.moderation.unbanUser.useMutation();
  const setRole = trpc.moderation.setRole.useMutation();
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    await utils.moderation.listUsers.invalidate();
  }

  async function onToggleBan(id: string, isBanned: boolean) {
    if (isBanned) await unbanUser.mutateAsync({ userId: id });
    else {
      if (!confirm("Banir esse usuário?")) return;
      await banUser.mutateAsync({ userId: id });
    }
    await refresh();
  }

  async function onSetRole(id: string, role: string) {
    setErr(null);
    try {
      await setRole.mutateAsync({ userId: id, role: role as (typeof ASSIGNABLE_ROLES)[number] });
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao trocar papel");
    }
  }

  return (
    <div>
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: 0 }}>Usuários</h1>
        <p className="hint-text" style={{ marginTop: 8 }}>
          Contas SPONSOR são gerenciadas em Patrocinadores — vincular/desvincular
          fica lá, não aqui.
        </p>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <input
          className="input" placeholder="Buscar por handle, e-mail ou nome…"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {err && <p className="error-text" style={{ marginTop: 12 }}>{err}</p>}

      <div className="card" style={{ marginTop: 20 }}>
        {isLoading ? (
          <p className="hint-text">Carregando…</p>
        ) : !users || users.length === 0 ? (
          <p className="hint-text">Nenhum usuário encontrado.</p>
        ) : (
          users.map((u) => (
            <div key={u.id} className="admin-row" style={{ flexWrap: "wrap" }}>
              <span className="titulo">
                {u.displayName} <span className="hint-text">@{u.handle}</span>
                <div className="meta">
                  {u.email} · saldo {fmtPoints(u.balance)} pts
                  {u.skillScore !== null && <> · skill {u.skillScore.toFixed(2)} ({u.resolvedCount} resolvidos)</>}
                  {" · desde "}{dtDisplay.format(new Date(u.createdAt))}
                </div>
              </span>
              {u.isBanned && <span className="badge badge-overdue">BANIDO</span>}
              {u.isSponsor && <span className="badge">ANUNCIANTE</span>}
              <select
                value={ASSIGNABLE_ROLES.includes(u.role as (typeof ASSIGNABLE_ROLES)[number]) ? u.role : "USER"}
                onChange={(e) => onSetRole(u.id, e.target.value)}
                disabled={setRole.isPending || u.id === me?.id}
                style={{ width: "auto" }}
              >
                {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
              <button
                className={`btn-outline ${u.isBanned ? "" : "btn-danger"}`}
                style={{ padding: "8px 14px", fontSize: 13, width: "auto" }}
                onClick={() => onToggleBan(u.id, u.isBanned)}
                disabled={banUser.isPending || unbanUser.isPending || u.id === me?.id}
              >
                {u.isBanned ? "Desbanir" : "Banir"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
