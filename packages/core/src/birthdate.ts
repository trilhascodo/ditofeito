// ============================================================================
// Data de nascimento — idade mínima de uso (prática padrão do setor: mesmo
// piso que Facebook/Instagram/TikTok), não é mecanismo anti-fraude (isso é
// papel do CPF, ver cpf.ts — pedido só no primeiro palpite, não no cadastro).
// ============================================================================

// Único lugar: apps/api valida com isso (AUTH_CONFIG.minAgeYears reexporta),
// apps/web usa o mesmo valor pra validação client-side — sem duplicar o
// número dos dois lados e arriscar os dois desalinharem.
export const MIN_SIGNUP_AGE = 13;

/** true se `birthDate` (YYYY-MM-DD) corresponde a alguém com `minYears`
 *  anos completos ou mais, na data de hoje. Data inválida = false.
 *
 *  UTC dos dois lados de propósito: `new Date("YYYY-MM-DD")` sempre parseia
 *  como meia-noite UTC (padrão ISO), então comparar com getters locais
 *  (getMonth/getDate) troca o "dia" perto da virada em fusos negativos
 *  (ex.: 2013-08-02 UTC vira 2013-08-01 em America/Sao_Paulo à noite) — dá
 *  data de nascimento errada por 1 dia bem na borda do aniversário. */
export function hasMinAge(birthDate: string, minYears: number): boolean {
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return false;

  const today = new Date();
  let age = today.getUTCFullYear() - d.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - d.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < d.getUTCDate())) age--;

  return age >= minYears;
}
