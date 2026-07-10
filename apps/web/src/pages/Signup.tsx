import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { signup } from "../lib/auth";

const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;

export function Signup() {
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!HANDLE_PATTERN.test(handle)) {
      setError("Nome de usuário: 3–30 caracteres, letras minúsculas, números e _");
      return;
    }
    setLoading(true);
    try {
      await signup({ handle, displayName, email, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main className="page-narrow">
        <div className="card">
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Dito.</h1>
          <p>Cadastro feito — 1.000 pontos de boas-vindas já estão na sua conta. Confirme seu
             e-mail (chegou um link) e <Link to="/entrar">faça login</Link>.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-narrow">
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Cadastrar</h1>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label className="label" htmlFor="handle">Nome de usuário</label>
            <input
              className="input" id="handle" required
              value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="displayName">Nome de exibição</label>
            <input
              className="input" id="displayName" required
              value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
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
              className="input" id="password" type="password" autoComplete="new-password"
              minLength={8} required
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Cadastrando…" : "Cadastrar"}
          </button>
        </form>
        <p className="hint-text" style={{ marginTop: 16 }}>
          Já tem conta? <Link to="/entrar">Entrar</Link>
        </p>
      </div>
    </main>
  );
}
