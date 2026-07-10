// Transacional apenas no MVP (plano-construcao.md §2: "Resend/SES nível
// gratuito"). Sem RESEND_API_KEY configurada (dev/local), cai para log no
// console — nunca bloqueia o fluxo de cadastro por falta de credencial.
const RESEND_API_URL = "https://api.resend.com/emails";

export interface TransactionalEmail {
  to: string;
  subject: string;
  html: string;
}

export async function sendTransactionalEmail(msg: TransactionalEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "DitoFeito <nao-responda@ditofeito.com>";

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
    console.error(`[email] falha ao enviar (${res.status}):`, await res.text());
  }
}
