import { z } from "zod";

// Regra de handle espelha o CHECK de users.handle no schema (packages/db/migrations/001_schema.sql).
export const signupSchema = z.object({
  handle: z.string().regex(/^[a-z0-9_]{3,30}$/, "3–30 caracteres: a-z, 0-9, _"),
  displayName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;
