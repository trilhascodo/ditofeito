import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, oauthGoogleLogin } from "../lib/auth";
import { useAuth } from "../lib/useAuth";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { GoogleCompleteProfileForm } from "../components/GoogleCompleteProfileForm";

const GOOGLE_ENABLED = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googlePending, setGooglePending] = useState<{ credential: string; name: string } | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ email, password });
      refresh();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleCredential(credential: string) {
    setGoogleError(null);
    try {
      const result = await oauthGoogleLogin(credential);
      if (result.status === "LOGGED_IN") {
        refresh();
        navigate("/");
      } else {
        setGooglePending({ credential, name: result.name });
      }
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : "Erro ao entrar com Google");
    }
  }

  if (googlePending) {
    return (
      <main className="page-narrow">
        <div className="card">
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Concluir cadastro</h1>
          <GoogleCompleteProfileForm
            credential={googlePending.credential}
            suggestedName={googlePending.name}
            onDone={() => { refresh(); navigate("/"); }}
            onCancel={() => setGooglePending(null)}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="page-narrow">
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Entrar</h1>
        {GOOGLE_ENABLED && (
          <>
            <GoogleSignInButton onCredential={onGoogleCredential} />
            {googleError && <p className="error-text" style={{ marginTop: 8 }}>{googleError}</p>}
            <p className="hint-text" style={{ margin: "16px 0", textAlign: "center" }}>ou</p>
          </>
        )}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label className="label" htmlFor="email">E-mail</label>
            <input
              className="input" id="email" type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">Senha</label>
            <input
              className="input" id="password" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="hint-text" style={{ marginTop: 16 }}>
          Não tem conta? <Link to="/cadastro">Cadastre-se</Link>
          {" · "}
          <Link to="/esqueci-senha">Esqueci minha senha</Link>
        </p>
      </div>
    </main>
  );
}
