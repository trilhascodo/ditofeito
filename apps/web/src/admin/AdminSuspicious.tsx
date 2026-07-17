import { useState } from "react";
import { trpc } from "../lib/trpc";

export function AdminSuspicious() {
  const utils = trpc.useUtils();
  const { data: clusters, isLoading } = trpc.moderation.listSuspiciousAccounts.useQuery();
  const banMutation = trpc.moderation.banUser.useMutation();
  const [banningId, setBanningId] = useState<string | null>(null);

  async function onBan(userId: string, handle: string) {
    if (!confirm(`Banir a conta @${handle}?`)) return;
    setBanningId(userId);
    try {
      await banMutation.mutateAsync({ userId });
      await utils.moderation.listSuspiciousAccounts.invalidate();
    } finally {
      setBanningId(null);
    }
  }

  return (
    <div className="card">
      <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: "0 0 4px" }}>Contas suspeitas</h1>
      <p className="hint-text" style={{ marginBottom: 12 }}>
        Grupos de contas criadas do mesmo IP. IP compartilhado (casa, wifi, faculdade) é
        falso-positivo esperado — revise antes de banir.
      </p>

      {isLoading && <p className="hint-text">Carregando…</p>}
      {clusters && clusters.length === 0 && <p className="hint-text">Nenhum cluster no momento.</p>}
      {clusters?.map((cluster) => (
        <div key={cluster.signupIp} className="admin-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <span className="titulo">
            {cluster.total} contas · IP {cluster.signupIp}
          </span>
          {cluster.accounts.map((acc) => (
            <div key={acc.id} className="admin-row" style={{ paddingLeft: 12 }}>
              <span className="titulo">
                @{acc.handle}
                <div className="meta">
                  {acc.email} · desde {new Date(acc.createdAt).toLocaleDateString("pt-BR")}
                  {acc.isBanned && " · banido"}
                </div>
              </span>
              {!acc.isBanned && (
                <button
                  className="btn-outline btn-danger" style={{ padding: "8px 14px", fontSize: 13 }}
                  onClick={() => onBan(acc.id, acc.handle)} disabled={banningId === acc.id}
                >
                  {banningId === acc.id ? "Banindo…" : "Banir"}
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
