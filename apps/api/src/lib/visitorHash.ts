// Hash do visitante pro analytics próprio (page_views) — sha256(salt-do-dia +
// ip + user-agent). O salt roda em memória do processo e nunca é persistido:
// muda toda virada de dia (e a cada deploy/restart), então o hash não é
// reversível pro IP real nem rastreável entre dias — só serve pra contar
// "visitante único hoje", não pra identificar ninguém.
import { createHash, randomBytes } from "node:crypto";

let saltDay = "";
let salt = "";

function todaySalt(): string {
  const today = new Date().toISOString().slice(0, 10);
  if (saltDay !== today) {
    saltDay = today;
    salt = randomBytes(16).toString("hex");
  }
  return salt;
}

export function visitorHash(ip: string | undefined, userAgent: string | undefined): string {
  return createHash("sha256").update(`${todaySalt()}|${ip ?? ""}|${userAgent ?? ""}`).digest("hex");
}
