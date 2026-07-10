import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import type { Context } from "./context.js";

const t = initTRPC.context<Context>().create({
  // Sem isso, erro de validação de input chega no cliente com `message` =
  // JSON.stringify(zodError.issues) (comportamento padrão do tRPC) — em vez
  // de um texto legível, o front mostra o array bruto pro usuário.
  errorFormatter(opts) {
    const { shape, error } = opts;
    if (error.cause instanceof ZodError) {
      return { ...shape, message: error.cause.issues.map((i) => i.message).join(" · ") };
    }
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// ADMIN cria/edita mercados; MODERATOR e RESOLVER só resolvem/anulam (README §users.role).
const ADMIN_WRITE_ROLES = new Set(["ADMIN"]);
const RESOLVER_ROLES = new Set(["ADMIN", "MODERATOR", "RESOLVER"]);

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ADMIN_WRITE_ROLES.has(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

export const resolverProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!RESOLVER_ROLES.has(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});
