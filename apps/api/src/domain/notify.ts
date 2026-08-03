import type { Pool, PoolClient } from "pg";

// Helper fino — funciona tanto dentro de uma transação (PoolClient, ex.:
// resolveMarket/voidMarket) quanto fora dela (Pool, ex.: comments.ts). Nunca
// deveria derrubar o fluxo principal por falha aqui; quem chama decide se
// quer capturar erro ou deixar propagar.
export async function notify(
  c: Pool | PoolClient,
  userId: string,
  kind: "MARKET_RESOLVED" | "MARKET_VOIDED" | "NEW_COMMENT" | "SPONSOR_REVIEW_APPROVED"
    | "SPONSOR_REVIEW_REJECTED" | "BOLAO_CLOSING_SOON" | "GROUP_JOINED"
    | "BOLAO_RESOLVED" | "STREAK_MILESTONE",
  body: string,
  opts: { marketId?: string; commentId?: string; groupId?: string; bolaoId?: string } = {},
): Promise<void> {
  await c.query(
    `INSERT INTO notifications (user_id, kind, market_id, comment_id, group_id, bolao_id, body)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [userId, kind, opts.marketId ?? null, opts.commentId ?? null, opts.groupId ?? null,
      opts.bolaoId ?? null, body],
  );
}
