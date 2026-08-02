// ============================================================================
// mercadoPago.ts — cliente HTTP fino pra API de Pagamentos do Mercado Pago.
// Sem SDK oficial de propósito (mesmo princípio de lib/email.ts: fetch cru,
// uma dependência a menos) — só os dois endpoints que este produto usa:
// criar cobrança (Pix/boleto) e reconsultar status (fonte de verdade do
// webhook, ver http/mercadoPagoWebhook.ts — nunca confiar no corpo do POST).
//
// ATENÇÃO: isto nunca vê número de cartão nem chave Pix da pessoa pagando —
// o Mercado Pago é quem coleta isso (QR code/boleto hospedados por eles);
// aqui só entra/sai o que a API de Pagamentos devolve (id, status, QR code,
// link do boleto). Sem token configurado (MERCADOPAGO_CONFIG.accessToken
// vazio), toda função lança — quem chama decide como degradar (ver
// routers/sponsor.ts::createTopup).
// ============================================================================
import { randomUUID } from "node:crypto";
import { MERCADOPAGO_CONFIG } from "../config.js";

export class MercadoPagoError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

interface PayerInput {
  email: string;
  /** CPF (11 dígitos) ou CNPJ (14 dígitos) só-números — sponsors.tax_id,
   *  opcional; omitido quando o sponsor ainda não preencheu. */
  taxId?: string | null;
  /** Nome/sobrenome de quem tá pagando — boleto registrado exige os dois
   *  ("payer.first_name , payer.last_name: Offline API Error" se faltar),
   *  Pix funciona sem. Opcional aqui pra não quebrar chamador que não tem
   *  essa info; quem chama decide a fonte (ver routers/sponsor.ts). */
  firstName?: string;
  lastName?: string;
}

function payerPayload(payer: PayerInput) {
  return {
    email: payer.email,
    ...(payer.taxId ? { identification: { type: payer.taxId.length === 11 ? "CPF" : "CNPJ", number: payer.taxId } } : {}),
    ...(payer.firstName && payer.lastName ? { first_name: payer.firstName, last_name: payer.lastName } : {}),
  };
}

async function mpFetch(path: string, init: RequestInit & { idempotencyKey?: string }): Promise<unknown> {
  if (!MERCADOPAGO_CONFIG.accessToken)
    throw new MercadoPagoError("Mercado Pago não configurado (MERCADOPAGO_ACCESS_TOKEN vazio)");
  const { idempotencyKey, ...rest } = init;
  const res = await fetch(`${MERCADOPAGO_CONFIG.apiBaseUrl}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${MERCADOPAGO_CONFIG.accessToken}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
      ...rest.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("[mercadopago] erro na API", res.status, body);
    throw new MercadoPagoError(`Mercado Pago respondeu ${res.status}`, res.status);
  }
  return body;
}

export interface PixPaymentResult {
  mpPaymentId: string;
  status: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
}

export async function createPixPayment(input: {
  amountCents: number; description: string; payer: PayerInput;
}): Promise<PixPaymentResult> {
  const body = (await mpFetch("/v1/payments", {
    method: "POST",
    idempotencyKey: randomUUID(),
    body: JSON.stringify({
      transaction_amount: input.amountCents / 100,
      description: input.description,
      payment_method_id: "pix",
      payer: payerPayload(input.payer),
    }),
  })) as {
    id: number; status: string;
    point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
  };
  return {
    mpPaymentId: String(body.id), status: body.status,
    qrCode: body.point_of_interaction?.transaction_data?.qr_code ?? null,
    qrCodeBase64: body.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
  };
}

export interface BoletoPaymentResult {
  mpPaymentId: string;
  status: string;
  boletoUrl: string | null;
}

export async function createBoletoPayment(input: {
  amountCents: number; description: string; payer: PayerInput;
}): Promise<BoletoPaymentResult> {
  const body = (await mpFetch("/v1/payments", {
    method: "POST",
    idempotencyKey: randomUUID(),
    body: JSON.stringify({
      transaction_amount: input.amountCents / 100,
      description: input.description,
      payment_method_id: "bolbradesco",
      payer: payerPayload(input.payer),
    }),
  })) as { id: number; status: string; transaction_details?: { external_resource_url?: string } };
  return {
    mpPaymentId: String(body.id), status: body.status,
    boletoUrl: body.transaction_details?.external_resource_url ?? null,
  };
}

export interface CardPaymentResult {
  mpPaymentId: string;
  status: string;
  statusDetail: string | null;
  cardLast4: string | null;
  cardBrand: string | null;
}

// Token vem do Card Payment Brick (tokenização no navegador, iframe do
// próprio Mercado Pago) — aqui nunca chega número de cartão, validade ou
// CVV, só o token de uso único. `installments` NÃO é parâmetro: fixo em 1
// (à vista) sempre, mesmo que o chamador tente mandar outra coisa — nunca
// confiar em dado vindo do navegador pra isso (mesmo espírito de nunca
// confiar no corpo do webhook, ver http/mercadoPagoWebhook.ts). CPF/CNPJ é
// obrigatório aqui (diferente do Pix/Boleto): emissor brasileiro exige, e
// vem do próprio formulário do Brick, não de sponsors.tax_id.
export async function createCardPayment(input: {
  amountCents: number; description: string;
  token: string; paymentMethodId: string; issuerId?: string; paymentMethodOptionId?: string;
  payer: { email: string; taxId: string };
}): Promise<CardPaymentResult> {
  const body = (await mpFetch("/v1/payments", {
    method: "POST",
    idempotencyKey: randomUUID(),
    body: JSON.stringify({
      transaction_amount: input.amountCents / 100,
      description: input.description,
      token: input.token,
      installments: 1,
      payment_method_id: input.paymentMethodId,
      ...(input.issuerId ? { issuer_id: input.issuerId } : {}),
      ...(input.paymentMethodOptionId ? { payment_method_option_id: input.paymentMethodOptionId } : {}),
      payer: payerPayload(input.payer),
    }),
  })) as {
    id: number; status: string; status_detail?: string; payment_method_id?: string;
    card?: { last_four_digits?: string };
  };
  return {
    mpPaymentId: String(body.id), status: body.status, statusDetail: body.status_detail ?? null,
    cardLast4: body.card?.last_four_digits ?? null, cardBrand: body.payment_method_id ?? null,
  };
}

/** Fonte de verdade de status — sempre chamar antes de creditar saldo por um
 *  webhook, nunca confiar no `status` que vem no corpo do POST recebido. */
export async function getPayment(mpPaymentId: string): Promise<{ status: string }> {
  const body = (await mpFetch(`/v1/payments/${encodeURIComponent(mpPaymentId)}`, {
    method: "GET",
  })) as { status: string };
  return { status: body.status };
}
