import { z } from "zod";
import { isValidCpf, onlyDigits, hasMinAge } from "@ditofeito/core";
import { AUTH_CONFIG } from "../config.js";

// Cadastro em camadas: CPF NÃO entra aqui de propósito — é pedido só no
// primeiro palpite pago com pontos (ver domain/trade.ts::executeTrade), não
// no cadastro. Data de nascimento é a barreira de entrada agora, mas por
// motivo diferente (idade mínima de uso, não anti-fraude).
const birthDateSchema = z.string().date("Data inválida").refine(
  (d) => hasMinAge(d, AUTH_CONFIG.minAgeYears),
  `Idade mínima: ${AUTH_CONFIG.minAgeYears} anos`,
);

// Regra de handle espelha o CHECK de users.handle no schema (packages/db/migrations/001_schema.sql).
export const signupSchema = z.object({
  handle: z.string().regex(/^[a-z0-9_]{3,30}$/, "3–30 caracteres: a-z, 0-9, _"),
  displayName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  birthDate: birthDateSchema,
  captchaToken: z.string().min(1, "Captcha obrigatório"),
  // Autodeclarado, opcional — sem geo-IP (mesma filosofia de zero terceiro
  // do resto do produto). Base pra segmentar patrocínio regional e, depois,
  // priorizar a própria grade de mercados por região.
  regionUf: z.string().length(2).optional(),
  regionCity: z.string().trim().max(120).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

// Passo separado, disparado só quando o usuário vai fazer o primeiro palpite
// pago com pontos (ver TradeError CPF_PENDENTE em domain/trade.ts) — garante
// "1 conta por pessoa" só onde isso de fato importa (ranking/reputação),
// não no cadastro.
export const submitCpfSchema = z.object({
  cpf: z.string().refine(isValidCpf, "CPF inválido").transform(onlyDigits),
});
export type SubmitCpfInput = z.infer<typeof submitCpfSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const requestPasswordResetSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// credential = ID token do Google Identity Services (JWT assinado pelo
// Google, verificado em lib/googleAuth.ts — nunca confiar nele sem checar).
export const oauthGoogleSchema = z.object({
  credential: z.string().min(1),
});
export type OauthGoogleInput = z.infer<typeof oauthGoogleSchema>;

// Segunda etapa só pra quem é conta nova (oauthGoogleSchema não achou
// identidade nem e-mail existente) — senha e verificação de e-mail somem
// (Google já garante o e-mail); CPF idem signupSchema, não entra aqui.
export const oauthCompleteSchema = z.object({
  credential: z.string().min(1),
  handle: z.string().regex(/^[a-z0-9_]{3,30}$/, "3–30 caracteres: a-z, 0-9, _"),
  displayName: z.string().trim().min(1).max(80),
  birthDate: birthDateSchema,
  captchaToken: z.string().min(1, "Captcha obrigatório"),
  regionUf: z.string().length(2).optional(),
  regionCity: z.string().trim().max(120).optional(),
});
export type OauthCompleteInput = z.infer<typeof oauthCompleteSchema>;
