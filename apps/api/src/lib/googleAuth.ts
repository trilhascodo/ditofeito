// Verifica o ID token (JWT) que o front recebe do Google Identity Services —
// nunca confia nas claims sem checar assinatura/audiência/emissor contra as
// chaves públicas do Google. google-auth-library cuida do cache do JWKS e da
// checagem de expiração/audiência.
import { OAuth2Client } from "google-auth-library";
import { OAUTH_CONFIG } from "../config.js";

const client = new OAuth2Client(OAUTH_CONFIG.googleClientId);

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export async function verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
  if (!OAUTH_CONFIG.googleClientId) throw new Error("Login com Google não configurado");
  const ticket = await client.verifyIdToken({ idToken: credential, audience: OAUTH_CONFIG.googleClientId });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) throw new Error("Token do Google inválido");
  return {
    sub: payload.sub, email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified === true, name: payload.name ?? "",
  };
}
