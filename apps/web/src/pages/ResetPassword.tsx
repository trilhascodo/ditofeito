import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "../lib/auth";

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await resetPassword({ token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao redefinir senha");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main className="page-narrow">
        <div className="card">
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Link inválido</h1>
          <p className="hint-text">Faltou o token na URL. Peça um novo link em
             <Link to="/esqueci-senha"> Esqueci minha senha</Link>.</p>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="page-narrow">
        <div className="card">
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Senha redefinida</h1>
          <p>Pode <Link to="/entrar">entrar</Link> com a senha nova.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-narrow">
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Nova senha</h1>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label className="label" htmlFor="password">Nova senha</label>
            <input
              className="input" id="password" type="password" autoComplete="new-password"
              minLength={8} required
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Salvando…" : "Redefinir senha"}
          </button>
        </form>
      </div>
    </main>
  );
}
