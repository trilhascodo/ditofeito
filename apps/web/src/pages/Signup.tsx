import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { formatCpf, isValidCpf, onlyDigits } from "@ditofeito/core";
import { signup } from "../lib/auth";
import { Turnstile } from "../components/Turnstile";

const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;
// Sem chave configurada (dev/local): backend também aceita qualquer token
// quando TURNSTILE_SECRET_KEY está vazio, então o front não trava sem captcha.
const CAPTCHA_REQUIRED = !!import.meta.env.VITE_TURNSTILE_SITE_KEY;

export function Signup() {
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cpf, setCpf] = useState("");
  const [captchaToken, setCaptchaToken] = useState(CAPTCHA_REQUIRED ? "" : "dev");
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
    if (!isValidCpf(cpf)) {
      setError("CPF inválido");
      return;
    }
    if (!captchaToken) {
      setError("Confirme o captcha");
      return;
    }
    setLoading(true);
    try {
      await signup({ handle, displayName, email, password, cpf: onlyDigits(cpf), captchaToken });
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
          <div className="field">
            <label className="label" htmlFor="cpf">CPF</label>
            <input
              className="input" id="cpf" inputMode="numeric" placeholder="000.000.000-00" required
              value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))}
            />
            <p className="hint-text">Usado só pra garantir 1 conta por pessoa — não é público.</p>
          </div>
          <div className="field">
            <Turnstile onToken={setCaptchaToken} />
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
