// Comemora em 3 (primeira sequência que já é notável) e depois a cada 5
// (5, 10, 15, 20…) — evita notificar toda hora (todo acerto seria marco) e
// evita nunca notificar de novo depois do primeiro (sequência de 1 dígito
// só, sem repetir o "uau" conforme cresce).
export function isStreakMilestone(streak: number): boolean {
  return streak === 3 || (streak >= 5 && streak % 5 === 0);
}
