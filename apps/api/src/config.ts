import { MIN_SIGNUP_AGE } from "@ditofeito/core";

export const APP_CONFIG = {
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  isProd: process.env.NODE_ENV === "production",
} as const;

export const AUTH_CONFIG = {
  signupBonusPoints: 1000,
  /** Idade mínima pra se cadastrar — @ditofeito/core::MIN_SIGNUP_AGE, mesmo
   *  valor que apps/web usa na validação client-side (não duplicar o número
   *  dos dois lados). Checado via data de nascimento, não é o mecanismo
   *  anti-fraude (isso é papel do CPF, pedido só no primeiro palpite — ver
   *  domain/trade.ts). */
  minAgeYears: MIN_SIGNUP_AGE,
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

export const SPORTS_CONFIG = {
  /** Vazio (dev/local) = gerador de esporte não roda, só loga aviso (mesmo
   *  padrão do TURNSTILE_SECRET_KEY/GOOGLE_CLIENT_ID: ausência de chave
   *  desliga a feature, não derruba o processo). */
  apiFootballKey: process.env.API_FOOTBALL_KEY ?? "",
  /** "Football Prediction API" no RapidAPI (não é o api-sports.io direto —
   *  mudou depois de testar contra a chave real assinada, jul/2026: exige
   *  X-RapidAPI-Key + X-RapidAPI-Host, não x-apisports-key). */
  footballPredictionBaseUrl: "https://football-prediction-api.p.rapidapi.com",
  footballPredictionHost: "football-prediction-api.p.rapidapi.com",
} as const;

export const FINANCE_CONFIG = {
  /** brapi.dev: cotações B3 exigem token no plano gratuito; câmbio não.
   *  Vazio = gerador financeiro roda só com o que não exige token. */
  brapiToken: process.env.BRAPI_API_KEY ?? "",
  brapiBaseUrl: "https://brapi.dev/api",
} as const;

export const MERCADOPAGO_CONFIG = {
  /** Vazio (dev/local) = recarga de saldo desligada no front, mesmo padrão
   *  de TURNSTILE_SECRET_KEY/GOOGLE_CLIENT_ID — ausência de chave desliga a
   *  feature, não derruba o processo. Token de produção: alguém precisa
   *  criar a aplicação no Mercado Pago e colar o Access Token em
   *  infra/.env na VPS — não é algo que se gera por código. */
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN ?? "",
  webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET ?? "",
  apiBaseUrl: "https://api.mercadopago.com",
} as const;
