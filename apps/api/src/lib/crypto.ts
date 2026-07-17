// Cifra segredos guardados no banco (hoje só a API key de e-mail,
// email_settings.api_key_encrypted) — diferente dos tokens de auth
// (hash, nunca precisam ser lidos de volta), aqui precisamos recuperar o
// valor original pra usar na Resend, então é cifra reversível, não hash.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const hex = process.env.EMAIL_CONFIG_KEY;
  if (!hex) throw new Error("EMAIL_CONFIG_KEY não configurada — gere com `openssl rand -hex 32`");
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) throw new Error("EMAIL_CONFIG_KEY precisa ter 32 bytes (64 caracteres hex)");
  return buf;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decrypt(stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) throw new Error("valor cifrado malformado");
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]).toString("utf8");
}
