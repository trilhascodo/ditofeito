// Cloudflare Turnstile — o site já roda atrás de Cloudflare (plano de infra),
// então zero custo e zero domínio novo pra confiar. Sem TURNSTILE_SECRET_KEY
// (dev/local), aceita qualquer token — não bloqueia o fluxo sem credencial,
// mesmo padrão de lib/email.ts.
import { CAPTCHA_CONFIG } from "../config.js";

export async function verifyCaptcha(token: string, ip?: string): Promise<boolean> {
  if (!CAPTCHA_CONFIG.secretKey) return true;

  const body = new URLSearchParams({ secret: CAPTCHA_CONFIG.secretKey, response: token });
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetch(CAPTCHA_CONFIG.verifyUrl, { method: "POST", body });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch (e) {
    console.error("[captcha] verificação falhou", e);
    return false;
  }
}
