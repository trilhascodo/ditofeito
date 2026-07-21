// ============================================================================
// auth.ts — Cadastro/login com argon2 + sessão em cookie httpOnly (packages/db
// migração 003). Vocabulário e mecânica seguem a linha jurídica do README:
// pontos de boas-vindas são NÃO conversíveis, só entram no ledger normal.
// ============================================================================
import { randomBytes, createHash } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { isDisposableEmail } from "@ditofeito/core";
import type { Pool, PoolClient } from "pg";
import { appendLedger } from "./trade.js";
import { sendTransactionalEmail } from "../lib/email.js";
import { verifyCaptcha } from "../lib/captcha.js";
import { verifyGoogleCredential } from "../lib/googleAuth.js";
import { AUTH_CONFIG, APP_CONFIG } from "../config.js";
import type {
  SignupInput, LoginInput, RequestPasswordResetInput, ResetPasswordInput, OauthCompleteInput,
} from "./auth.schemas.js";

export class AuthError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export interface SessionUser {
  id: string;
  handle: string;
  displayName: string;
  role: string;
  emailVerified: boolean;
  sponsorId: string | null;
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
  pool: Pool, input: SignupInput, meta: { ip?: string; userAgent?: string } = {},
): Promise<{ userId: string }> {
  const captchaOk = await verifyCaptcha(input.captchaToken, meta.ip);
  if (!captchaOk) throw new AuthError("CAPTCHA_INVALIDO", "Não foi possível validar o captcha");
  if (isDisposableEmail(input.email))
    throw new AuthError("EMAIL_DESCARTAVEL", "E-mails temporários não são aceitos");

  const passwordHash = await argonHash(input.password);
  const client = await pool.connect();
  let userId: string;
  let verifyRaw: string;
  try {
    await client.query("BEGIN");

    const dup = await client.query(
      `SELECT handle, email, cpf FROM users WHERE handle=$1 OR email=$2 OR cpf=$3`,
      [input.handle, input.email, input.cpf]);
    if (dup.rowCount) {
      const row = dup.rows[0];
      const code = row.email === input.email ? "EMAIL_EM_USO"
        : row.cpf === input.cpf ? "CPF_EM_USO" : "HANDLE_EM_USO";
      const message = { EMAIL_EM_USO: "E-mail já cadastrado", CPF_EM_USO: "CPF já cadastrado",
        HANDLE_EM_USO: "Nome de usuário já em uso" }[code];
      throw new AuthError(code, message);
    }

    const u = await client.query(
      `INSERT INTO users (handle, display_name, email, password_hash, cpf, signup_ip, signup_user_agent,
                          region_uf, region_city)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [input.handle, input.displayName, input.email, passwordHash, input.cpf,
        meta.ip ?? null, meta.userAgent ?? null,
        input.regionUf ?? null, input.regionCity?.trim() || null]);
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
  await sendTransactionalEmail(pool, {
    to: input.email,
    subject: "Confirme seu e-mail — DitoFeito",
    html: `<p>Pode escrever. Confirme seu e-mail para registrar previsões:</p>
           <p><a href="${link}">${link}</a></p>
           <p>Se não foi você, ignore esta mensagem.</p>`,
  }).catch((e) => console.error("[auth] envio de verificação falhou", e));

  return { userId };
}

// -------------------------- Sessão (compartilhado) -------------------------------
async function issueSession(
  db: Pool | PoolClient, userId: string, meta: { userAgent?: string; ip?: string },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + AUTH_CONFIG.sessionTtlDays * 86_400_000);
  await db.query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [userId, hashToken(token), meta.userAgent ?? null, meta.ip ?? null, expiresAt.toISOString()]);
  return { token, expiresAt };
}

interface UserRow {
  id: string; handle: string; display_name: string; role: string;
  is_banned: boolean; email_verified_at: string | null; sponsor_id: string | null;
}
function toSessionUser(row: UserRow): SessionUser {
  return {
    id: row.id, handle: row.handle, displayName: row.display_name,
    role: row.role, emailVerified: row.email_verified_at !== null,
    sponsorId: row.sponsor_id,
  };
}

// -------------------------------- Login ----------------------------------------
export async function login(
  pool: Pool, input: LoginInput, meta: { userAgent?: string; ip?: string },
): Promise<{ token: string; expiresAt: Date; user: SessionUser }> {
  const u = await pool.query(
    `SELECT id, handle, display_name, role, password_hash, is_banned, email_verified_at, sponsor_id
       FROM users WHERE email = $1`, [input.email]);
  const invalid = () => new AuthError("CREDENCIAIS_INVALIDAS", "E-mail ou senha incorretos");
  if (!u.rowCount) throw invalid();
  const row = u.rows[0];
  if (row.is_banned) throw new AuthError("USUARIO_SUSPENSO", "Conta suspensa");
  // Conta criada só por login social (ex.: Google) não tem senha — nada pra
  // comparar, então é sempre "credenciais inválidas" nesse caminho (a pessoa
  // deveria entrar pelo botão do provedor, não pelo formulário).
  if (!row.password_hash) throw invalid();

  const ok = await argonVerify(row.password_hash, input.password);
  if (!ok) throw invalid();

  const { token, expiresAt } = await issueSession(pool, row.id, meta);
  return { token, expiresAt, user: toSessionUser(row) };
}

// ---------------------------- Login com Google ------------------------------------
// Duas etapas porque CPF continua obrigatório (login social não resolve "1
// conta por pessoa"): 1ª chamada (oauthGoogleLogin) resolve se já existe
// conta pra logar; se for gente nova, front pede handle+CPF e chama
// oauthGoogleComplete com o MESMO credential (reverificado — nunca confia em
// claim que já passou pelo cliente sem novo check de assinatura).
export type OauthGoogleResult =
  | { status: "LOGGED_IN"; token: string; expiresAt: Date; user: SessionUser }
  | { status: "NEEDS_PROFILE"; email: string; name: string };

export async function oauthGoogleLogin(
  pool: Pool, credential: string, meta: { ip?: string; userAgent?: string } = {},
): Promise<OauthGoogleResult> {
  const identity = await verifyGoogleCredential(credential);

  const existing = await pool.query(
    `SELECT u.id, u.handle, u.display_name, u.role, u.is_banned, u.email_verified_at, u.sponsor_id
       FROM oauth_identities oi JOIN users u ON u.id = oi.user_id
      WHERE oi.provider = 'GOOGLE' AND oi.provider_user_id = $1`,
    [identity.sub]);
  if (existing.rowCount) {
    const row = existing.rows[0] as UserRow;
    if (row.is_banned) throw new AuthError("USUARIO_SUSPENSO", "Conta suspensa");
    const { token, expiresAt } = await issueSession(pool, row.id, meta);
    return { status: "LOGGED_IN", token, expiresAt, user: toSessionUser(row) };
  }

  // 1ª vez com Google: se o Google confirma o e-mail e ele já é de uma conta
  // existente (senha), liga a identidade em vez de arriscar duplicata — só
  // quando o e-mail é verificado pelo provedor, nunca confia numa claim não
  // verificada pra fundir com conta de outra pessoa.
  if (identity.emailVerified) {
    const byEmail = await pool.query(
      `SELECT id, handle, display_name, role, is_banned, email_verified_at, sponsor_id
         FROM users WHERE email = $1`, [identity.email]);
    if (byEmail.rowCount) {
      const row = byEmail.rows[0] as UserRow;
      if (row.is_banned) throw new AuthError("USUARIO_SUSPENSO", "Conta suspensa");
      await pool.query(
        `INSERT INTO oauth_identities (user_id, provider, provider_user_id, email)
         VALUES ($1,'GOOGLE',$2,$3)`,
        [row.id, identity.sub, identity.email]);
      const { token, expiresAt } = await issueSession(pool, row.id, meta);
      return { status: "LOGGED_IN", token, expiresAt, user: toSessionUser(row) };
    }
  }

  return { status: "NEEDS_PROFILE", email: identity.email, name: identity.name };
}

export async function oauthGoogleComplete(
  pool: Pool, input: OauthCompleteInput, meta: { ip?: string; userAgent?: string } = {},
): Promise<{ token: string; expiresAt: Date; user: SessionUser }> {
  const captchaOk = await verifyCaptcha(input.captchaToken, meta.ip);
  if (!captchaOk) throw new AuthError("CAPTCHA_INVALIDO", "Não foi possível validar o captcha");

  const identity = await verifyGoogleCredential(input.credential);
  if (isDisposableEmail(identity.email))
    throw new AuthError("EMAIL_DESCARTAVEL", "E-mails temporários não são aceitos");

  const client = await pool.connect();
  let userId: string;
  try {
    await client.query("BEGIN");

    const already = await client.query(
      `SELECT 1 FROM oauth_identities WHERE provider = 'GOOGLE' AND provider_user_id = $1`,
      [identity.sub]);
    if (already.rowCount)
      throw new AuthError("EMAIL_EM_USO", "Essa conta Google já está vinculada a um cadastro");

    const dup = await client.query(
      `SELECT handle, email, cpf FROM users WHERE handle=$1 OR email=$2 OR cpf=$3`,
      [input.handle, identity.email, input.cpf]);
    if (dup.rowCount) {
      const row = dup.rows[0];
      const code = row.email === identity.email ? "EMAIL_EM_USO"
        : row.cpf === input.cpf ? "CPF_EM_USO" : "HANDLE_EM_USO";
      const message = { EMAIL_EM_USO: "E-mail já cadastrado", CPF_EM_USO: "CPF já cadastrado",
        HANDLE_EM_USO: "Nome de usuário já em uso" }[code];
      throw new AuthError(code, message);
    }

    const u = await client.query(
      `INSERT INTO users (handle, display_name, email, cpf, signup_ip, signup_user_agent,
                          region_uf, region_city, email_verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [input.handle, input.displayName, identity.email, input.cpf,
        meta.ip ?? null, meta.userAgent ?? null,
        input.regionUf ?? null, input.regionCity?.trim() || null,
        identity.emailVerified ? new Date() : null]);
    userId = u.rows[0].id;

    await client.query(
      `INSERT INTO oauth_identities (user_id, provider, provider_user_id, email)
       VALUES ($1,'GOOGLE',$2,$3)`,
      [userId, identity.sub, identity.email]);

    await appendLedger(client, userId, AUTH_CONFIG.signupBonusPoints, "SIGNUP_BONUS", null, null);

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  const { token, expiresAt } = await issueSession(pool, userId, meta);
  const row = (await pool.query(
    `SELECT id, handle, display_name, role, is_banned, email_verified_at, sponsor_id
       FROM users WHERE id = $1`, [userId])).rows[0] as UserRow;
  return { token, expiresAt, user: toSessionUser(row) };
}

export async function logout(pool: Pool, rawToken: string): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(rawToken)]);
}

export async function getSessionUser(pool: Pool, rawToken: string | undefined): Promise<SessionUser | null> {
  if (!rawToken) return null;
  const { rows, rowCount } = await pool.query(
    `SELECT u.id, u.handle, u.display_name, u.role, u.is_banned, u.email_verified_at, u.sponsor_id
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(rawToken)]);
  if (!rowCount || rows[0].is_banned) return null;
  const row = rows[0];
  return {
    id: row.id, handle: row.handle, displayName: row.display_name,
    role: row.role, emailVerified: row.email_verified_at !== null,
    sponsorId: row.sponsor_id,
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

// ---------------------------- Recuperação de senha -------------------------------
// requestPasswordReset nunca revela se o e-mail existe (a rota HTTP sempre
// responde a mesma mensagem genérica) — evita enumeração de contas.
export async function requestPasswordReset(pool: Pool, input: RequestPasswordResetInput): Promise<void> {
  const u = await pool.query(`SELECT id, is_banned FROM users WHERE email = $1`, [input.email]);
  if (!u.rowCount || u.rows[0].is_banned) return;
  const userId = u.rows[0].id;

  const raw = randomToken();
  const expires = new Date(Date.now() + AUTH_CONFIG.passwordResetTtlHours * 3600_000);
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
    [userId, hashToken(raw), expires.toISOString()]);

  const link = `${APP_CONFIG.webOrigin}/redefinir-senha?token=${raw}`;
  await sendTransactionalEmail(pool, {
    to: input.email,
    subject: "Redefinir senha — DitoFeito",
    html: `<p>Pediram uma nova senha pra essa conta. Se foi você, clique no link
           abaixo (vale por ${AUTH_CONFIG.passwordResetTtlHours}h):</p>
           <p><a href="${link}">${link}</a></p>
           <p>Se não foi você, ignore esta mensagem — sua senha continua a mesma.</p>`,
  }).catch((e) => console.error("[auth] envio de recuperação de senha falhou", e));
}

export async function resetPassword(pool: Pool, input: ResetPasswordInput): Promise<void> {
  const passwordHash = await argonHash(input.password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = await client.query(
      `SELECT id, user_id, expires_at, consumed_at FROM password_reset_tokens
        WHERE token_hash = $1 FOR UPDATE`,
      [hashToken(input.token)]);
    if (!t.rowCount) throw new AuthError("TOKEN_INVALIDO", "Link de redefinição inválido");
    const row = t.rows[0];
    if (row.consumed_at) throw new AuthError("TOKEN_JA_USADO", "Link já utilizado");
    if (new Date(row.expires_at) <= new Date())
      throw new AuthError("TOKEN_EXPIRADO", "Link de redefinição expirado");

    await client.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`,
      [passwordHash, row.user_id]);
    await client.query(`UPDATE password_reset_tokens SET consumed_at = now() WHERE id = $1`,
      [row.id]);
    // Redefinir senha invalida sessões existentes — se a conta foi
    // comprometida, o reset também derruba quem estava logado antes.
    await client.query(`DELETE FROM sessions WHERE user_id = $1`, [row.user_id]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
