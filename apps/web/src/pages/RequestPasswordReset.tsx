import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../lib/auth";

export function RequestPasswordReset() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset({ email });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao pedir redefinição");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main className="page-narrow">
        <div className="card">
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Verifique seu e-mail</h1>
          <p>Se esse e-mail tiver conta no DitoFeito, chega um link de redefinição em instantes.</p>
          <p><Link to="/entrar">Voltar pro login</Link></p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-narrow">
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Esqueci minha senha</h1>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label className="label" htmlFor="email">E-mail</label>
            <input
              className="input" id="email" type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Enviando…" : "Enviar link de redefinição"}
          </button>
        </form>
        <p className="hint-text" style={{ marginTop: 16 }}>
          <Link to="/entrar">Voltar pro login</Link>
        </p>
      </div>
    </main>
  );
}
