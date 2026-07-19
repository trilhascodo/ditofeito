import { z } from "zod";
import { isValidCpf, onlyDigits } from "@ditofeito/core";

// Regra de handle espelha o CHECK de users.handle no schema (packages/db/migrations/001_schema.sql).
export const signupSchema = z.object({
  handle: z.string().regex(/^[a-z0-9_]{3,30}$/, "3–30 caracteres: a-z, 0-9, _"),
  displayName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  cpf: z.string().refine(isValidCpf, "CPF inválido").transform(onlyDigits),
  captchaToken: z.string().min(1, "Captcha obrigatório"),
  // Autodeclarado, opcional — sem geo-IP (mesma filosofia de zero terceiro
  // do resto do produto). Base pra segmentar patrocínio regional e, depois,
  // priorizar a própria grade de mercados por região.
  regionUf: z.string().length(2).optional(),
  regionCity: z.string().trim().max(120).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

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
