import { useState, type FormEvent } from "react";
import { formatCpf, isValidCpf, onlyDigits } from "@ditofeito/core";
import { oauthGoogleComplete, type AuthUser } from "../lib/auth";
import { Turnstile } from "./Turnstile";
import { UFS } from "../lib/ufs";
import { useUfGeolocation } from "../lib/useUfGeolocation";

const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;
const CAPTCHA_REQUIRED = !!import.meta.env.VITE_TURNSTILE_SITE_KEY;

// Segunda etapa do login/cadastro com Google (usada por Login.tsx e
// Signup.tsx) — o Google já garantiu e-mail e identidade, então só falta o
// que ele não dá: nome de usuário e CPF (garante 1 conta por pessoa).
export function GoogleCompleteProfileForm({
  credential, suggestedName, onDone, onCancel,
}: {
  credential: string; suggestedName: string; onDone: (user: AuthUser) => void; onCancel: () => void;
}) {
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState(suggestedName);
  const [cpf, setCpf] = useState("");
  const [regionUf, setRegionUf] = useState("");
  const [regionCity, setRegionCity] = useState("");
  const [captchaToken, setCaptchaToken] = useState(CAPTCHA_REQUIRED ? "" : "dev");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ufGeo = useUfGeolocation();

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
      const { user } = await oauthGoogleComplete({
        credential, handle, displayName, cpf: onlyDigits(cpf), captchaToken,
        regionUf: regionUf || undefined, regionCity: regionCity.trim() || undefined,
      });
      onDone(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao concluir o cadastro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="hint-text" style={{ marginBottom: 16 }}>
        Sua conta Google já confirmou o e-mail — falta só um nome de usuário e o CPF
        (garante 1 conta por pessoa, nunca é público).
      </p>
      <div className="field">
        <label className="label" htmlFor="g-handle">Nome de usuário</label>
        <input
          className="input" id="g-handle" required
          value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="g-displayName">Nome de exibição</label>
        <input
          className="input" id="g-displayName" required
          value={displayName} onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="g-cpf">CPF</label>
        <input
          className="input" id="g-cpf" inputMode="numeric" placeholder="000.000.000-00" required
          value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="g-uf">Estado (opcional)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select id="g-uf" style={{ flex: 1 }} value={regionUf} onChange={(e) => setRegionUf(e.target.value)}>
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
      </div>
      {regionUf && (
        <div className="field">
          <label className="label" htmlFor="g-city">Cidade (opcional)</label>
          <input
            className="input" id="g-city" placeholder="Codó"
            value={regionCity} onChange={(e) => setRegionCity(e.target.value)}
          />
        </div>
      )}
      <div className="field">
        <Turnstile onToken={setCaptchaToken} />
      </div>
      {error && <p className="error-text">{error}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Criando…" : "Concluir cadastro"}
        </button>
        <button className="btn-outline" type="button" style={{ width: "auto" }} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
