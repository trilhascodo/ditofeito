import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { oauthGoogleLogin } from "../lib/auth";
import { useAuth } from "../lib/useAuth";
import { rememberReturnTo } from "../lib/attribution";
import { GoogleSignInButton } from "./GoogleSignInButton";

const GOOGLE_ENABLED = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Chamada pra quem ainda não tem conta, no painel do mercado. Funil de
// 2026-09: 73% das visitas entram direto num mercado e só 0,5% chegavam ao
// cadastro — o painel dizia só "Entrar", que pra quem nunca veio soa como
// "isso é pra quem já tem conta". Agora: cadastro em primeiro plano, Google
// em 1 clique, e a pessoa volta pro mesmo mercado depois.
export function SignupCta({ returnPath }: { returnPath: string }) {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);

  async function onGoogleCredential(credential: string) {
    setError(null);
    try {
      const result = await oauthGoogleLogin(credential);
      if (result.status === "LOGGED_IN") {
        refresh(); // já tinha conta: fica no mesmo mercado, agora logado
      } else {
        rememberReturnTo(returnPath);
        navigate("/cadastro", { state: { googlePending: { credential, name: result.name } } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao continuar com Google");
    }
  }

  return (
    <>
      <h2>O que você diz?</h2>
      <p className="sub">
        Crie sua conta grátis e ganhe <strong>1.000 pontos</strong> pra registrar sua previsão.
      </p>
      {GOOGLE_ENABLED && (
        <div style={{ marginBottom: 10 }}>
          <GoogleSignInButton onCredential={onGoogleCredential} />
          {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
        </div>
      )}
      <Link
        to="/cadastro" className={GOOGLE_ENABLED ? "btn-outline" : "btn"}
        style={{ display: "block", textAlign: "center" }}
        onClick={() => rememberReturnTo(returnPath)}
      >
        {GOOGLE_ENABLED ? "Criar conta com e-mail" : "Criar conta grátis"}
      </Link>
      <p className="hint-text" style={{ marginTop: 10, textAlign: "center" }}>
        Já tem conta?{" "}
        <Link to="/entrar" onClick={() => rememberReturnTo(returnPath)}>Entrar</Link>
      </p>
    </>
  );
}
