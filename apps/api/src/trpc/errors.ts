import { TRPCError } from "@trpc/server";
import { TradeError } from "../domain/trade.js";
import { AuthError } from "../domain/auth.js";

type TRPCErrorCode = ConstructorParameters<typeof TRPCError>[0]["code"];

const CODE_MAP: Record<string, TRPCErrorCode> = {
  MERCADO_INEXISTENTE: "NOT_FOUND",
  OUTCOME_INVALIDO: "BAD_REQUEST",
  MERCADO_FECHADO: "BAD_REQUEST",
  MERCADO_ENCERRADO: "BAD_REQUEST",
  STATUS_INVALIDO: "BAD_REQUEST",
  USUARIO_INVALIDO: "FORBIDDEN",
  VALOR_INVALIDO: "BAD_REQUEST",
  SHARES_INSUFICIENTES: "BAD_REQUEST",
  SALDO_INSUFICIENTE: "BAD_REQUEST",
  LIMITE_EXPOSICAO: "BAD_REQUEST",
  EMAIL_EM_USO: "CONFLICT",
  HANDLE_EM_USO: "CONFLICT",
  CREDENCIAIS_INVALIDAS: "UNAUTHORIZED",
  USUARIO_SUSPENSO: "FORBIDDEN",
  TOKEN_INVALIDO: "BAD_REQUEST",
  TOKEN_JA_USADO: "BAD_REQUEST",
  TOKEN_EXPIRADO: "BAD_REQUEST",
};

/** Converte TradeError/AuthError em TRPCError com o código HTTP-ish certo;
 *  qualquer outro erro sobe intacto (vira INTERNAL_SERVER_ERROR no cliente,
 *  igual ao error middleware final do Express nas rotas HTTP puras). */
export function throwAsTRPC(e: unknown): never {
  if (e instanceof TradeError || e instanceof AuthError) {
    throw new TRPCError({ code: CODE_MAP[e.code] ?? "BAD_REQUEST", message: e.message, cause: e });
  }
  throw e;
}
