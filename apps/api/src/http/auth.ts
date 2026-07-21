import type express from "express";
import rateLimit from "express-rate-limit";
import type { Pool } from "pg";
import {
  signup, login, logout, verifyEmail, requestPasswordReset, resetPassword,
  oauthGoogleLogin, oauthGoogleComplete, AuthError,
} from "../domain/auth.js";
import {
  signupSchema, loginSchema, requestPasswordResetSchema, resetPasswordSchema,
  oauthGoogleSchema, oauthCompleteSchema,
} from "../domain/auth.schemas.js";
import { optionalAuth, requireAuth } from "./middleware.js";
import { asyncHandler } from "./asyncHandler.js";
import { AUTH_CONFIG, APP_CONFIG } from "../config.js";

const AUTH_ERROR_STATUS: Record<string, number> = {
  EMAIL_EM_USO: 409,
  HANDLE_EM_USO: 409,
  CPF_EM_USO: 409,
  CAPTCHA_INVALIDO: 400,
  EMAIL_DESCARTAVEL: 400,
  CREDENCIAIS_INVALIDAS: 401,
  USUARIO_SUSPENSO: 403,
  TOKEN_INVALIDO: 400,
  TOKEN_JA_USADO: 400,
  TOKEN_EXPIRADO: 400,
};

function cookieOptions() {
  return {
    httpOnly: true,
    secure: APP_CONFIG.isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: AUTH_CONFIG.sessionTtlDays * 86_400_000,
  };
}

export function mountAuth(app: express.Express, pool: Pool) {
  app.use(optionalAuth(pool));

  const authLimiter = (max: number) => rateLimit({
    windowMs: AUTH_CONFIG.rateLimit.windowMs, limit: max,
    standardHeaders: true, legacyHeaders: false,
  });

  app.post("/auth/signup", authLimiter(AUTH_CONFIG.rateLimit.signupMax), asyncHandler(async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ erro: "DADOS_INVALIDOS", detalhes: parsed.error.flatten() });
    try {
      const { userId } = await signup(pool, parsed.data, {
        ip: req.ip, userAgent: req.get("user-agent"),
      });
      res.status(201).json({ userId });
    } catch (e) {
      if (e instanceof AuthError) return res.status(AUTH_ERROR_STATUS[e.code] ?? 400).json({ erro: e.code, mensagem: e.message });
      throw e;
    }
  }));

  app.post("/auth/login", authLimiter(AUTH_CONFIG.rateLimit.loginMax), asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ erro: "DADOS_INVALIDOS", detalhes: parsed.error.flatten() });
    try {
      const { token, user } = await login(pool, parsed.data, {
        userAgent: req.get("user-agent"), ip: req.ip,
      });
      res.cookie(AUTH_CONFIG.sessionCookieName, token, cookieOptions());
      res.json({ user });
    } catch (e) {
      if (e instanceof AuthError) return res.status(AUTH_ERROR_STATUS[e.code] ?? 400).json({ erro: e.code, mensagem: e.message });
      throw e;
    }
  }));

  // 1ª etapa do login com Google: loga direto se já existe identidade/conta
  // vinculável, ou devolve "precisa completar perfil" (handle+CPF) pra gente
  // nova — nunca cria conta sozinha (ver domain/auth.ts::oauthGoogleLogin).
  app.post("/auth/oauth/google", authLimiter(AUTH_CONFIG.rateLimit.loginMax), asyncHandler(async (req, res) => {
    const parsed = oauthGoogleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ erro: "DADOS_INVALIDOS", detalhes: parsed.error.flatten() });
    try {
      const result = await oauthGoogleLogin(pool, parsed.data.credential, { ip: req.ip, userAgent: req.get("user-agent") });
      if (result.status === "NEEDS_PROFILE") return res.json({ status: "NEEDS_PROFILE", email: result.email, name: result.name });
      res.cookie(AUTH_CONFIG.sessionCookieName, result.token, cookieOptions());
      res.json({ status: "LOGGED_IN", user: result.user });
    } catch (e) {
      if (e instanceof AuthError) return res.status(AUTH_ERROR_STATUS[e.code] ?? 400).json({ erro: e.code, mensagem: e.message });
      throw e;
    }
  }));

  // 2ª etapa: só chega aqui quem oauthGoogleLogin mandou completar o perfil.
  // Reverifica o credential (nunca confia no que já passou pelo cliente).
  app.post("/auth/oauth/google/complete",
    authLimiter(AUTH_CONFIG.rateLimit.signupMax), asyncHandler(async (req, res) => {
      const parsed = oauthCompleteSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ erro: "DADOS_INVALIDOS", detalhes: parsed.error.flatten() });
      try {
        const { token, user } = await oauthGoogleComplete(pool, parsed.data, { ip: req.ip, userAgent: req.get("user-agent") });
        res.cookie(AUTH_CONFIG.sessionCookieName, token, cookieOptions());
        res.status(201).json({ user });
      } catch (e) {
        if (e instanceof AuthError) return res.status(AUTH_ERROR_STATUS[e.code] ?? 400).json({ erro: e.code, mensagem: e.message });
        throw e;
      }
    }));

  // Sempre responde a mesma mensagem genérica, exista ou não o e-mail —
  // requestPasswordReset() já não revela isso (evita enumeração de contas).
  app.post("/auth/request-password-reset",
    authLimiter(AUTH_CONFIG.rateLimit.passwordResetMax), asyncHandler(async (req, res) => {
      const parsed = requestPasswordResetSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ erro: "DADOS_INVALIDOS", detalhes: parsed.error.flatten() });
      await requestPasswordReset(pool, parsed.data);
      res.json({ mensagem: "Se esse e-mail tiver conta, chega um link de redefinição em instantes." });
    }));

  app.post("/auth/reset-password", asyncHandler(async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ erro: "DADOS_INVALIDOS", detalhes: parsed.error.flatten() });
    try {
      await resetPassword(pool, parsed.data);
      res.json({ ok: true });
    } catch (e) {
      if (e instanceof AuthError) return res.status(AUTH_ERROR_STATUS[e.code] ?? 400).json({ erro: e.code, mensagem: e.message });
      throw e;
    }
  }));

  app.post("/auth/logout", asyncHandler(async (req, res) => {
    const token = req.cookies?.[AUTH_CONFIG.sessionCookieName] as string | undefined;
    if (token) await logout(pool, token);
    res.clearCookie(AUTH_CONFIG.sessionCookieName, { path: "/" });
    res.status(204).end();
  }));

  app.get("/auth/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  app.get("/auth/verify-email", asyncHandler(async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    try {
      if (!token) throw new AuthError("TOKEN_INVALIDO", "Link de verificação inválido");
      await verifyEmail(pool, token);
      res.type("html").send(confirmacaoHtml("E-mail confirmado.", "Pode escrever — sua conta está pronta."));
    } catch (e) {
      const msg = e instanceof AuthError ? e.message : "Erro ao confirmar e-mail";
      res.status(e instanceof AuthError ? (AUTH_ERROR_STATUS[e.code] ?? 400) : 500)
        .type("html").send(confirmacaoHtml("Não foi possível confirmar", msg));
    }
  }));
}

function confirmacaoHtml(titulo: string, corpo: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#FAF8F3;color:#1E2733;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif}
.card{max-width:420px;text-align:center;padding:32px}
h1{font-size:22px;margin:0 0 8px}
a{color:#5B4B8A}</style></head><body>
<div class="card"><h1>${titulo}</h1><p>${corpo}</p><p><a href="${APP_CONFIG.webOrigin}">Voltar ao DitoFeito</a></p></div>
</body></html>`;
}
