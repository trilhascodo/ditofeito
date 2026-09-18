import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { hasMinAge, MIN_SIGNUP_AGE } from "@ditofeito/core";
import { signup, oauthGoogleLogin } from "../lib/auth";
import { Turnstile } from "../components/Turnstile";
import { UFS } from "../lib/ufs";
import { useUfGeolocation } from "../lib/useUfGeolocation";
import { useAuth } from "../lib/useAuth";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { GoogleCompleteProfileForm } from "../components/GoogleCompleteProfileForm";
import { consumeReturnTo, signupSource } from "../lib/attribution";

const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;
// Sem chave configurada (dev/local): backend também aceita qualquer token
// quando TURNSTILE_SECRET_KEY está vazio, então o front não trava sem captcha.
const CAPTCHA_REQUIRED = !!import.meta.env.VITE_TURNSTILE_SITE_KEY;
const GOOGLE_ENABLED = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

export function Signup() {
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [regionUf, setRegionUf] = useState("");
  const [regionCity, setRegionCity] = useState("");
  const [captchaToken, setCaptchaToken] = useState(CAPTCHA_REQUIRED ? "" : "dev");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const location = useLocation();
  // Vem preenchido quando o Google foi clicado no painel do mercado
  // (SignupCta) e a conta ainda não existia — cai direto em "concluir".
  const [googlePending, setGooglePending] = useState<{ credential: string; name: string } | null>(
    (location.state as { googlePending?: { credential: string; name: string } } | null)?.googlePending ?? null,
  );
  // Com Google disponível, o formulário de e-mail começa recolhido: o único
  // cadastro que chegou ao fim no funil de 2026-09 foi pelo Google.
  const [showEmailForm, setShowEmailForm] = useState(!GOOGLE_ENABLED);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const ufGeo = useUfGeolocation();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  async function onGoogleCredential(credential: string) {
    setGoogleError(null);
    try {
      const result = await oauthGoogleLogin(credential);
      if (result.status === "LOGGED_IN") {
        refresh();
        navigate(consumeReturnTo() ?? "/");
      } else {
        setGooglePending({ credential, name: result.name });
      }
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : "Erro ao continuar com Google");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!HANDLE_PATTERN.test(handle)) {
      setError("Nome de usuário: 3–30 caracteres, letras minúsculas, números e _");
      return;
    }
    if (!birthDate || !hasMinAge(birthDate, MIN_SIGNUP_AGE)) {
      setError(`Idade mínima: ${MIN_SIGNUP_AGE} anos`);
      return;
    }
    if (!captchaToken) {
      setError("Confirme o captcha");
      return;
    }
    setLoading(true);
    try {
      await signup({
        handle, displayName, email, password, birthDate, captchaToken,
        regionUf: regionUf || undefined, regionCity: regionCity.trim() || undefined,
        source: signupSource(),
      });
      // Cadastro já devolve sessão (auth.ts::signup) — entra direto e volta
      // pra onde a pessoa estava; confirmar o e-mail fica pra depois.
      refresh();
      navigate(consumeReturnTo() ?? "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar");
    } finally {
      setLoading(false);
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
            onDone={() => { refresh(); navigate(consumeReturnTo() ?? "/"); }}
            onCancel={() => setGooglePending(null)}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="page-narrow">
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Criar conta grátis</h1>
        <p className="hint-text" style={{ marginBottom: 16 }}>
          Você começa com <strong>1.000 pontos</strong> pra prever eleição, futebol e o que mais
          estiver em jogo — e prova no ranking quem acerta mais. Sem dinheiro de verdade.
        </p>
        {GOOGLE_ENABLED && (
          <>
            <GoogleSignInButton onCredential={onGoogleCredential} />
            {googleError && <p className="error-text" style={{ marginTop: 8 }}>{googleError}</p>}
            <p className="hint-text" style={{ margin: "16px 0", textAlign: "center" }}>ou</p>
            {!showEmailForm && (
              <button type="button" className="btn-outline" onClick={() => setShowEmailForm(true)}>
                Cadastrar com e-mail
              </button>
            )}
          </>
        )}
        {showEmailForm && (
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
              <label className="label" htmlFor="birthDate">Data de nascimento</label>
              <input
                className="input" id="birthDate" type="date" required
                value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
              />
              <p className="hint-text">
                Precisa ter pelo menos {MIN_SIGNUP_AGE} anos — nunca é público.
              </p>
            </div>
            <div className="field">
              <label className="label" htmlFor="regionUf">Estado (opcional)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <select id="regionUf" style={{ flex: 1 }} value={regionUf} onChange={(e) => setRegionUf(e.target.value)}>
                  <option value="">prefiro não dizer</option>
                  {UFS.map((uf) => <option key={uf.value} value={uf.value}>{uf.label}</option>)}
                </select>
                <button
                  type="button" className="btn-outline"
                  style={{ width: "auto", flex: "0 0 auto", padding: "10px 14px" }}
                  disabled={ufGeo.status === "locating"}
                  onClick={() => ufGeo.locate(setRegionUf)}
                >
                  {ufGeo.status === "locating" ? "Localizando…" : "Usar minha localização"}
                </button>
              </div>
              {ufGeo.error && <p className="error-text">{ufGeo.error}</p>}
              <p className="hint-text">
                Usado só pra mostrar patrocinadores e conteúdo relevante pra sua região — nunca é público.
              </p>
            </div>
            {regionUf && (
              <div className="field">
                <label className="label" htmlFor="regionCity">Cidade (opcional)</label>
                <input
                  className="input" id="regionCity" placeholder="Codó"
                  value={regionCity} onChange={(e) => setRegionCity(e.target.value)}
                />
              </div>
            )}
            <div className="field">
              <Turnstile onToken={setCaptchaToken} />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "Cadastrando…" : "Cadastrar"}
            </button>
            <p className="hint-text" style={{ marginTop: 10 }}>
              Ao se cadastrar, você concorda com os{" "}
              <Link to="/termos">termos de uso e a política de privacidade</Link>.
            </p>
          </form>
        )}
        <p className="hint-text" style={{ marginTop: 16 }}>
          Já tem conta? <Link to="/entrar">Entrar</Link>
        </p>
      </div>
    </main>
  );
}
