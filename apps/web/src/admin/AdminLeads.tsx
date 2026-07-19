import { trpc } from "../lib/trpc";

const PLAN_LABEL: Record<string, string> = {
  BASICO: "Básico", PROFISSIONAL: "Profissional", PREMIUM: "Premium",
};

const dtDisplay = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function AdminLeads() {
  const utils = trpc.useUtils();
  const { data: leads } = trpc.leads.list.useQuery();
  const markContacted = trpc.leads.markContacted.useMutation();

  async function onMarkContacted(id: string) {
    await markContacted.mutateAsync({ id });
    await utils.leads.list.invalidate();
  }

  const novos = leads?.filter((l) => l.status === "NOVO") ?? [];
  const contatados = leads?.filter((l) => l.status === "CONTATADO") ?? [];

  return (
    <div>
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: 0 }}>Leads de anunciante</h1>
        <p className="hint-text" style={{ marginTop: 8 }}>
          Contatos recebidos pela página pública /anuncie.
        </p>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>
          Novos {novos.length > 0 && <span className="badge" style={{ marginLeft: 6 }}>{novos.length}</span>}
        </h2>
        {novos.length === 0 ? (
          <p className="hint-text">Nenhum lead novo.</p>
        ) : (
          novos.map((l) => (
            <div key={l.id} className="admin-row" style={{ alignItems: "flex-start" }}>
              <span className="titulo">
                {l.name} · {l.company}
                <div className="meta">
                  <a href={`mailto:${l.email}`}>{l.email}</a>
                  {l.phone && <> · {l.phone}</>}
                  {l.plan && <> · interesse: {PLAN_LABEL[l.plan] ?? l.plan}</>}
                  {" · "}{dtDisplay.format(new Date(l.createdAt))}
                </div>
                {l.message && <p style={{ marginTop: 6, fontSize: 13 }}>{l.message}</p>}
              </span>
              <button
                className="btn-outline" style={{ padding: "8px 14px", fontSize: 13 }}
                onClick={() => onMarkContacted(l.id)} disabled={markContacted.isPending}
              >
                Marcar como contatado
              </button>
            </div>
          ))
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Contatados</h2>
        {contatados.length === 0 ? (
          <p className="hint-text">Nenhum ainda.</p>
        ) : (
          contatados.map((l) => (
            <div key={l.id} className="admin-row">
              <span className="titulo">
                {l.name} · {l.company}
                <div className="meta">
                  <a href={`mailto:${l.email}`}>{l.email}</a>
                  {l.plan && <> · interesse: {PLAN_LABEL[l.plan] ?? l.plan}</>}
                  {" · "}{dtDisplay.format(new Date(l.createdAt))}
                </div>
              </span>
              <span className="badge">CONTATADO</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
