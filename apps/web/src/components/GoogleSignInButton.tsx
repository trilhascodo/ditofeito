import { useEffect, useRef } from "react";

// Carrega o script só quando o botão é montado (mesmo padrão de Turnstile.tsx)
// — só Login/Cadastro precisam.
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (opts: { client_id: string; callback: (resp: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Falha ao carregar o login do Google"));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

// onCredential recebe o ID token (JWT) do Google — front nunca lê as claims
// dele, só repassa pro backend, que reverifica a assinatura antes de confiar
// em qualquer coisa (ver apps/api/src/lib/googleAuth.ts).
export function GoogleSignInButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  useEffect(() => {
    if (!clientId || !ref.current) return;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !ref.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => onCredential(resp.credential),
      });
      window.google.accounts.id.renderButton(ref.current, {
        theme: "outline", size: "large", text: "continue_with", width: 320,
      });
      // eslint-disable-next-line @typescript-eslint/no-empty-function
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  if (!clientId) return null; // sem chave configurada: botão simplesmente não aparece
  return <div ref={ref} />;
}
