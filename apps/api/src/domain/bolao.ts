// ============================================================================
// bolao.ts — palpite privado de grupo, sobre um mercado já existente OU
// sobre um evento que o próprio grupo definiu (bolão "custom", ver
// migrations/036_bolao_custom.sql). Não é LMSR: cada membro só marca um
// palpite, sem comprar/vender share.
// Vencedor = quem acerta em cheio; 2+ acertadores dividem (co-vencedores,
// sem payout de pontos); ninguém acerta = ninguém venceu (nunca cai pra
// "mais perto ganha" — ver migrations/031_boloes.sql).
// ============================================================================

export type GuessType = "WINNER" | "SCORE" | "NUMBER";
export type BolaoStatus = "OPEN" | "AGUARDANDO_RESOLUCAO" | "RESOLVIDO" | "VOID";

export interface Palpite {
  userId: string;
  guessOutcomeId?: string | null;
  guessHomeScore?: number | null;
  guessAwayScore?: number | null;
  guessNumber?: number | null;
}

export interface ResultadoReal {
  outcomeId?: string | null; // WINNER
  homeScore?: number | null; // SCORE
  awayScore?: number | null; // SCORE
  number?: number | null; // NUMBER
}

function acertou(p: Palpite, tipo: GuessType, real: ResultadoReal): boolean {
  if (tipo === "WINNER") return real.outcomeId != null && p.guessOutcomeId === real.outcomeId;
  if (tipo === "SCORE")
    return (
      real.homeScore != null &&
      real.awayScore != null &&
      p.guessHomeScore === real.homeScore &&
      p.guessAwayScore === real.awayScore
    );
  return real.number != null && p.guessNumber === real.number;
}

/** user_ids de quem acertou em cheio — vazio = ninguém venceu. */
export function calcularVencedores(palpites: Palpite[], tipo: GuessType, real: ResultadoReal): string[] {
  return palpites.filter((p) => acertou(p, tipo, real)).map((p) => p.userId);
}

/** Status derivado, nunca guardado em coluna — evita desincronizar do
 *  status do mercado subjacente (fonte única de verdade). `marketStatus`
 *  null = bolão de evento próprio do grupo (sem mercado curado por trás,
 *  ver migrations/036_bolao_custom.sql): status vem do prazo que o próprio
 *  grupo definiu (`customCloseAt`), e TODO guessType (inclusive WINNER)
 *  precisa de resolução manual — sem mercado, nada resolve sozinho. */
export function statusBolao(
  marketStatus: string | null,
  guessType: GuessType,
  resolvedAt: string | Date | null,
  customCloseAt?: string | Date,
): BolaoStatus {
  if (marketStatus === null) {
    if (customCloseAt && new Date(customCloseAt) > new Date()) return "OPEN";
    return resolvedAt ? "RESOLVIDO" : "AGUARDANDO_RESOLUCAO";
  }
  if (marketStatus === "VOIDED") return "VOID";
  if (marketStatus !== "RESOLVED") return "OPEN";
  if (guessType === "WINNER") return "RESOLVIDO";
  return resolvedAt ? "RESOLVIDO" : "AGUARDANDO_RESOLUCAO";
}
