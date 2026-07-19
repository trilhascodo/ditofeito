// Limitador em memória, por chave — processo único da API (sem múltiplas
// réplicas nesse deploy), então não precisa de Redis/estado compartilhado.
// Reaproveitável em qualquer mutation tRPC sensível a spam (comments.create
// é o primeiro uso; auth já tem o próprio express-rate-limit na borda HTTP).
const buckets = new Map<string, number[]>();

/** true = liberado (registra a ação); false = estourou o limite. */
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}
