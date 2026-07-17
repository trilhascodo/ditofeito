// ============================================================================
// CPF — validação de formato/dígito verificador (sem consulta a bureau/Receita).
// Garante 1 número por conta (unicidade no banco), não confirma identidade real.
// ============================================================================

export function onlyDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Formata incrementalmente (só os separadores dos dígitos já presentes) —
 *  serve tanto pra exibir um CPF completo quanto pra mascarar durante a digitação. */
export function formatCpf(raw: string): string {
  const d = onlyDigits(raw).slice(0, 11);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean);
  let out = parts.join(".");
  if (d.length > 9) out += `-${d.slice(9, 11)}`;
  return out;
}

function checkDigit(digits: string, weightStart: number): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += Number(digits[i]) * (weightStart - i);
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/** Valida formato (11 dígitos), rejeita sequências triviais (000.000.000-00
 *  etc.) e confere os 2 dígitos verificadores pelo algoritmo padrão da Receita. */
export function isValidCpf(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  const dv1 = checkDigit(d.slice(0, 9), 10);
  if (dv1 !== Number(d[9])) return false;
  const dv2 = checkDigit(d.slice(0, 10), 11);
  if (dv2 !== Number(d[10])) return false;

  return true;
}
