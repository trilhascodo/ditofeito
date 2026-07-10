// ============================================================================
// auth.ts — Cadastro/login com argon2 + sessão em cookie httpOnly (packages/db
// migração 003). Vocabulário e mecânica seguem a linha jurídica do README:
// pontos de boas-vindas são NÃO conversíveis, só entram no ledger normal.
// ============================================================================
import { randomBytes, createHash } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import type { Pool } from "pg";
import { appendLedger } from "./trade.js";
import { sendTransactionalEmail } from "../lib/email.js";
import { AUTH_CONFIG, APP_CONFIG } from "../config.js";
import type { SignupInput, LoginInput } from "./auth.schemas.js";

export class AuthError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export interface SessionUser {
  id: string;
  handle: string;
  displayName: string;
  role: string;
  emailVerified: boolean;
}

// ------------------------------ Tokens ---------------------------------------
function randomToken(): string {
  return randomBytes(32).toString("hex");
}
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// ------------------------------ Cadastro --------------------------------------
export async function signup(
  pool: Pool, input: SignupInput,
): Promise<{ userId: string }> {
  const passwordHash = await argonHash(input.password);
  const client = await pool.connect();
  let userId: string;
  let verifyRaw: string;
  try {
    await client.query("BEGIN");

    const dup = await client.query(
      `SELECT handle, email FROM users WHERE handle=$1 OR email=$2`,
      [input.handle, input.email]);
    if (dup.rowCount) {
      const row = dup.rows[0];
      throw new AuthError(
        row.email === input.email ? "EMAIL_EM_USO" : "HANDLE_EM_USO",
        row.email === input.email ? "E-mail já cadastrado" : "Nome de usuário já em uso");
    }

    const u = await client.query(
      `INSERT INTO users (handle, display_name, email, password_hash)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [input.handle, input.displayName, input.email, passwordHash]);
    userId = u.rows[0].id;

    await appendLedger(client, userId, AUTH_CONFIG.signupBonusPoints, "SIGNUP_BONUS", null, null);

    verifyRaw = randomToken();
    const expires = new Date(Date.now() + AUTH_CONFIG.emailVerificationTtlHours * 3600_000);
    await client.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1,$2,$3)`,
      [userId, hashToken(verifyRaw), expires.toISOString()]);

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  const link = `${APP_CONFIG.appBaseUrl}/auth/verify-email?token=${verifyRaw}`;
  await sendTransactionalEmail({
    to: input.email,
    subject: "Confirme seu e-mail — DitoFeito",
    html: `<p>Pode escrever. Confirme seu e-mail para registrar previsões:</p>
           <p><a href="${link}">${link}</a></p>
           <p>Se não foi você, ignore esta mensagem.</p>`,
  }).catch((e) => console.error("[auth] envio de verificação falhou", e));

  return { userId };
}

// -------------------------------- Login ----------------------------------------
export async function login(
  pool: Pool, input: LoginInput, meta: { userAgent?: string; ip?: string },
): Promise<{ token: string; expiresAt: Date; user: SessionUser }> {
  const u = await pool.query(
    `SELECT id, handle, display_name, role, password_hash, is_banned, email_verified_at
       FROM users WHERE email = $1`, [input.email]);
  const invalid = () => new AuthError("CREDENCIAIS_INVALIDAS", "E-mail ou senha incorretos");
  if (!u.rowCount) throw invalid();
  const row = u.rows[0];
  if (row.is_banned) throw new AuthError("USUARIO_SUSPENSO", "Conta suspensa");

  const ok = await argonVerify(row.password_hash, input.password);
  if (!ok) throw invalid();

  const token = randomToken();
  const expiresAt = new Date(Date.now() + AUTH_CONFIG.sessionTtlDays * 86_400_000);
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [row.id, hashToken(token), meta.userAgent ?? null, meta.ip ?? null, expiresAt.toISOString()]);

  return {
    token, expiresAt,
    user: {
      id: row.id, handle: row.handle, displayName: row.display_name,
      role: row.role, emailVerified: row.email_verified_at !== null,
    },
  };
}

export async function logout(pool: Pool, rawToken: string): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(rawToken)]);
}

export async function getSessionUser(pool: Pool, rawToken: string | undefined): Promise<SessionUser | null> {
  if (!rawToken) return null;
  const { rows, rowCount } = await pool.query(
    `SELECT u.id, u.handle, u.display_name, u.role, u.is_banned, u.email_verified_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(rawToken)]);
  if (!rowCount || rows[0].is_banned) return null;
  const row = rows[0];
  return {
    id: row.id, handle: row.handle, displayName: row.display_name,
    role: row.role, emailVerified: row.email_verified_at !== null,
  };
}

// ---------------------------- Verificação de e-mail -----------------------------
export async function verifyEmail(pool: Pool, rawToken: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = await client.query(
      `SELECT id, user_id, expires_at, consumed_at FROM email_verification_tokens
        WHERE token_hash = $1 FOR UPDATE`,
      [hashToken(rawToken)]);
    if (!t.rowCount) throw new AuthError("TOKEN_INVALIDO", "Link de verificação inválido");
    const row = t.rows[0];
    if (row.consumed_at) throw new AuthError("TOKEN_JA_USADO", "Link já utilizado");
    if (new Date(row.expires_at) <= new Date())
      throw new AuthError("TOKEN_EXPIRADO", "Link de verificação expirado");

    await client.query(`UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1`,
      [row.user_id]);
    await client.query(`UPDATE email_verification_tokens SET consumed_at = now() WHERE id = $1`,
      [row.id]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
