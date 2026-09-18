// Origem do tráfego (migrations/045_traffic_source.sql) e "voltar pra onde
// estava" depois de entrar/cadastrar. Tudo em storage do navegador, sem
// cookie e sem terceiro — mesmo espírito do page_views. Storage pode estar
// bloqueado (aba anônima, preview), então toda leitura/escrita é tolerante.
import { sourceFromSearch } from "@ditofeito/core";

const VISIT_SOURCE_KEY = "visitSource";   // sessionStorage: canal desta visita
const FIRST_SOURCE_KEY = "firstSource";   // localStorage: 1º canal que trouxe a pessoa
const RETURN_TO_KEY = "returnTo";

function safe<T>(fn: () => T): T | undefined {
  try { return fn(); } catch { return undefined; }
}

/** Lê ?origem=/utm_source/fbclid/gclid da URL e guarda. Chamado a cada rota. */
export function captureSource(search: string): void {
  const s = sourceFromSearch(search);
  if (!s) return;
  safe(() => {
    sessionStorage.setItem(VISIT_SOURCE_KEY, s);
    if (!localStorage.getItem(FIRST_SOURCE_KEY)) localStorage.setItem(FIRST_SOURCE_KEY, s);
  });
}

export function visitSource(): string | undefined {
  return safe(() => sessionStorage.getItem(VISIT_SOURCE_KEY)) ?? undefined;
}

/** Primeiro canal que trouxe a pessoa — vai no cadastro (users.signup_source). */
export function signupSource(): string | undefined {
  return safe(() => localStorage.getItem(FIRST_SOURCE_KEY)) ?? undefined;
}

// Só caminho interno ("/m/x"), nunca URL absoluta nem "//host" — senão vira
// redirecionamento aberto pra fora do site.
function isInternalPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

const NO_RETURN = new Set(["/entrar", "/cadastro", "/esqueci-senha", "/redefinir-senha"]);

/** Lembra a página atual pra voltar nela depois do login/cadastro. */
export function rememberReturnTo(path: string): void {
  if (!isInternalPath(path) || NO_RETURN.has(path)) return;
  safe(() => localStorage.setItem(RETURN_TO_KEY, path));
}

/** Devolve (e apaga) a página guardada, se houver. */
export function consumeReturnTo(): string | undefined {
  const path = safe(() => {
    const p = localStorage.getItem(RETURN_TO_KEY);
    localStorage.removeItem(RETURN_TO_KEY);
    return p;
  });
  return path && isInternalPath(path) ? path : undefined;
}
