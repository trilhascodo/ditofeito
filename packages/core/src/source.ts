// Origem de tráfego/cadastro (migrations/045_traffic_source.sql). Mesma regra
// no front (lê da URL) e no backend (saneia o que o front mandou): minúsculo,
// só a-z0-9_.-, até 40 caracteres — é rótulo de canal, nunca texto livre/PII.
const SOURCE_PATTERN = /^[a-z0-9_.-]{1,40}$/;

export function normalizeSource(raw: string | null | undefined): string | undefined {
  const s = raw?.trim().toLowerCase();
  return s && SOURCE_PATTERN.test(s) ? s : undefined;
}

// Origem declarada explicitamente (?origem=, ou utm_source de campanha) vence;
// sem ela, os IDs de clique que Meta/Google anexam sozinhos ao link ainda
// dizem de onde veio — é o caso típico do link aberto dentro do app do
// Instagram/Facebook, que não manda referrer.
export function sourceFromSearch(search: string): string | undefined {
  const q = new URLSearchParams(search);
  return normalizeSource(q.get("origem"))
    ?? normalizeSource(q.get("utm_source"))
    ?? (q.has("fbclid") ? "facebook-instagram" : undefined)
    ?? (q.has("gclid") ? "google-ads" : undefined);
}
