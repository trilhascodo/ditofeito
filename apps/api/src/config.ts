export const APP_CONFIG = {
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  isProd: process.env.NODE_ENV === "production",
} as const;

export const AUTH_CONFIG = {
  signupBonusPoints: 1000,
  sessionTtlDays: 30,
  emailVerificationTtlHours: 48,
  /** Mais curto que a verificação de e-mail — token de reset é mais sensível
   *  (troca a senha na hora), então a janela de uso fica menor. */
  passwordResetTtlHours: 2,
  sessionCookieName: "df_session",
  /** Piso de segurança contra brute force (segurança mínima inominável). */
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    signupMax: 10,
    loginMax: 20,
    passwordResetMax: 5,
  },
} as const;

export const CAPTCHA_CONFIG = {
  /** Vazio (dev/local) = captcha sempre passa, mesmo padrão do RESEND_API_KEY. */
  secretKey: process.env.TURNSTILE_SECRET_KEY ?? "",
  verifyUrl: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
} as const;

export const OAUTH_CONFIG = {
  /** Client ID é público por natureza (mesmo frontend embute em VITE_GOOGLE_CLIENT_ID)
   *  — o que autentica de verdade é a assinatura do ID token, verificada contra as
   *  chaves públicas do Google em lib/googleAuth.ts. Vazio = botão de Google some
   *  do front e a rota de login social sempre falha (mesmo padrão do Turnstile). */
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
} as const;
