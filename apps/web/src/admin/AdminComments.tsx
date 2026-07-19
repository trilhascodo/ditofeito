import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";

const dtDisplay = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function AdminComments() {
  const utils = trpc.useUtils();
  const { data: reported } = trpc.moderation.listReportedComments.useQuery();
  const hideComment = trpc.moderation.hideComment.useMutation();
  const dismiss = trpc.moderation.dismissCommentReports.useMutation();

  async function refresh() {
    await utils.moderation.listReportedComments.invalidate();
  }

  async function onHide(commentId: string) {
    if (!confirm("Ocultar esse comentário? Ele some da página do mercado pra todo mundo.")) return;
    await hideComment.mutateAsync({ commentId });
    await refresh();
  }

  async function onDismiss(commentId: string) {
    await dismiss.mutateAsync({ commentId });
    await refresh();
  }

  return (
    <div>
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: 0 }}>Comentários denunciados</h1>
        <p className="hint-text" style={{ marginTop: 8 }}>
          Denúncia nunca oculta sozinha — sempre decisão sua ou de outro moderador/resolvedor.
        </p>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        {!reported || reported.length === 0 ? (
          <p className="hint-text">Nenhuma denúncia pendente.</p>
        ) : (
          reported.map((c) => (
            <div key={c.id} className="admin-row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
              <span className="titulo">
                <Link to={`/m/${c.marketSlug}`} target="_blank" rel="noopener noreferrer">{c.marketTitle}</Link>
                <div className="meta">
                  {c.authorDisplayName} (@{c.authorHandle}) · {dtDisplay.format(new Date(c.createdAt))}
                </div>
                <p style={{ marginTop: 8, fontSize: 14 }}>{c.body}</p>
                {c.reasons.length > 0 && (
                  <p className="hint-text" style={{ marginTop: 4, fontSize: 12 }}>
                    Motivos: {c.reasons.join(" · ")}
                  </p>
                )}
              </span>
              <span className="badge badge-overdue">{c.reportCount} denúncia{c.reportCount === 1 ? "" : "s"}</span>
              <button
                className="btn-outline btn-danger" style={{ padding: "8px 14px", fontSize: 13 }}
                onClick={() => onHide(c.id)} disabled={hideComment.isPending}
              >
                Ocultar
              </button>
              <button
                className="btn-outline" style={{ padding: "8px 14px", fontSize: 13 }}
                onClick={() => onDismiss(c.id)} disabled={dismiss.isPending}
              >
                Descartar denúncia
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
