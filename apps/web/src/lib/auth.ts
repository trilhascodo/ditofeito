// Wrappers HTTP puros para /auth/* (apps/api/src/http/auth.ts) — essas rotas
// ficam fora do tRPC de propósito (README §6.3), então falam direto com fetch.
export interface AuthUser {
  id: string;
  handle: string;
  displayName: string;
  role: string;
  emailVerified: boolean;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.mensagem ?? body?.erro ?? "Falha na requisição");
  return body as T;
}

export function signup(input: {
  handle: string; displayName: string; email: string; password: string;
  cpf: string; captchaToken: string;
}) {
  return call<{ userId: string }>("/auth/signup", { method: "POST", body: JSON.stringify(input) });
}

export function login(input: { email: string; password: string }) {
  return call<{ user: AuthUser }>("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export function requestPasswordReset(input: { email: string }) {
  return call<{ mensagem: string }>("/auth/request-password-reset", { method: "POST", body: JSON.stringify(input) });
}

export function resetPassword(input: { token: string; password: string }) {
  return call<{ ok: boolean }>("/auth/reset-password", { method: "POST", body: JSON.stringify(input) });
}

export async function logout(): Promise<void> {
  await fetch("/auth/logout", { method: "POST", credentials: "include" });
}

export function me() {
  return call<{ user: AuthUser }>("/auth/me");
}
