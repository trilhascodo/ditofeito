// Transacional (plano-construcao.md §2: "Resend/SES nível gratuito").
// Config vem do banco (email_settings, editável em /admin/email) com
// fallback pro env var legado — e por último modo dev (loga no console,
// nunca bloqueia o fluxo de cadastro por falta de credencial).
import type { Pool } from "pg";
import { decrypt } from "./crypto.js";

const RESEND_API_URL = "https://api.resend.com/emails";

export interface TransactionalEmail {
  to: string;
  subject: string;
  html: string;
}

export async function sendTransactionalEmail(pool: Pool, msg: TransactionalEmail): Promise<void> {
  const cfg = await pool.query(`SELECT from_address, api_key_encrypted FROM email_settings WHERE id = true`);
  const row = cfg.rows[0] as { from_address?: string; api_key_encrypted?: string | null } | undefined;
  const apiKey = row?.api_key_encrypted ? decrypt(row.api_key_encrypted) : process.env.RESEND_API_KEY;
  const from = row?.from_address ?? process.env.EMAIL_FROM ?? "DitoFeito <nao-responda@ditofeito.com>";

  if (!apiKey) {
    console.log(`[email:dev] para=${msg.to} assunto="${msg.subject}"\n${msg.html}`);
    return;
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: msg.to, subject: msg.subject, html: msg.html }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error(`[email] falha ao enviar (${res.status}):`, detail);
    throw new Error(`Falha ao enviar (${res.status}): ${detail}`);
  }
}
