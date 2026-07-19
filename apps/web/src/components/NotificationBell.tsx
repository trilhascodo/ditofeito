import { useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";

const KIND_ICON: Record<string, string> = {
  MARKET_RESOLVED: "✓", MARKET_VOIDED: "↺", NEW_COMMENT: "💬",
};

const timeFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

// Sino no header — sem push/e-mail, só central in-app. unreadCount faz
// polling leve (60s) pra pegar notificação nova sem o usuário recarregar a
// página; abrir o dropdown marca tudo como lido.
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: unread } = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: items } = trpc.notifications.list.useQuery(undefined, { enabled: open });
  const markAllRead = trpc.notifications.markAllRead.useMutation();

  function onToggle() {
    const next = !open;
    setOpen(next);
    if (next && unread && unread > 0) {
      markAllRead.mutate(undefined, {
        onSuccess: () => { utils.notifications.unreadCount.invalidate(); utils.notifications.list.invalidate(); },
      });
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button type="button" className="notif-bell" onClick={onToggle} aria-label="Notificações">
        🔔
        {!!unread && unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="notif-dropdown">
          {!items ? (
            <p className="hint-text" style={{ padding: 14 }}>Carregando…</p>
          ) : items.length === 0 ? (
            <p className="hint-text" style={{ padding: 14 }}>Nenhuma notificação ainda.</p>
          ) : (
            items.map((n) => {
              const body = (
                <>
                  <span style={{ marginRight: 6 }}>{KIND_ICON[n.kind] ?? "•"}</span>
                  {n.body}
                  <span className="notif-item-time">{timeFmt.format(new Date(n.createdAt))}</span>
                </>
              );
              return n.marketSlug ? (
                <Link
                  key={n.id} to={`/m/${n.marketSlug}`} onClick={() => setOpen(false)}
                  className={`notif-item ${n.readAt ? "" : "unread"}`}
                >
                  {body}
                </Link>
              ) : (
                <div key={n.id} className={`notif-item ${n.readAt ? "" : "unread"}`}>{body}</div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
