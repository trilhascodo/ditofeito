import { useState, type FormEvent } from "react";
import { trpc } from "../lib/trpc";
import { Turnstile } from "../components/Turnstile";

type Plan = "BASICO" | "PROFISSIONAL" | "PREMIUM";

const CAPTCHA_REQUIRED = !!import.meta.env.VITE_TURNSTILE_SITE_KEY;

// Cada plano libera um CONJUNTO cumulativo de formatos que já existem no
// portal (tokens.css: .patro-faixa / .market-tile-ad / .patro-slot) — plano
// maior sempre inclui os formatos dos menores, nunca troca um pelo outro.
// Nada de formato novo prometido aqui que a gente não construiu ainda.
// Preço é referência (mídia kit interno), negociável no contato.
const PLANOS: {
  id: Plan; nome: string; local: string; desc: string;
  specs: string; extras: string[]; preco: string; destaque?: boolean;
}[] = [
  {
    id: "BASICO",
    nome: "Básico",
    local: "Faixa horizontal",
    desc: "Card compacto na faixa logo abaixo do slide de destaque da home.",
    specs: "Logo até 80×22px (envie em 2x: ~160×44px, PNG fundo transparente)",
    extras: ["1 rede social"],
    preco: "R$ 300/mês",
  },
  {
    id: "PROFISSIONAL",
    nome: "Profissional",
    local: "Faixa + nativo na grade",
    desc: "Tudo do Básico, mais um card intercalado na grade de mercados, a cada 6 mercados reais.",
    specs: "Logo até 32px de altura (envie em 2x: ~400×64px, PNG fundo transparente)",
    extras: ["3 redes sociais", "Inclui a faixa horizontal do plano Básico"],
    preco: "R$ 650/mês",
    destaque: true,
  },
  {
    id: "PREMIUM",
    nome: "Premium",
    local: "Faixa + grade + coluna lateral",
    desc: "Tudo do Profissional, mais o card grande ao lado do slide de destaque — a posição mais visível do portal.",
    specs: "Logo simples (até 44px) ou arte própria preenchendo o card inteiro (~600×700px, JPG/PNG)",
    extras: ["5 redes sociais", "Aceita arte pronta própria (não só logo+nome)", "Inclui faixa + grade dos planos anteriores"],
    preco: "R$ 1.200/mês",
  },
];

export function Anuncie() {
  const createLead = trpc.leads.create.useMutation();

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState<Plan | "">("");
  const [message, setMessage] = useState("");
  const [captchaToken, setCaptchaToken] = useState(CAPTCHA_REQUIRED ? "" : "dev");
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function onEscolherPlano(id: Plan) {
    setPlan(id);
    document.getElementById("contato")?.scrollIntoView({ behavior: "smooth" });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!captchaToken) { setErr("Confirme o captcha antes de enviar."); return; }
    try {
      await createLead.mutateAsync({
        name: name.trim(), company: company.trim(), email: email.trim(),
        phone: phone.trim() || undefined, plan: plan || undefined,
        message: message.trim() || undefined, captchaToken,
      });
      setSent(true);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Erro ao enviar. Tenta de novo.");
    }
  }

  return (
    <main className="page">
      <section style={{ maxWidth: 720, margin: "12px 0 48px" }}>
        <span className="eyebrow">Anuncie no DitoFeito</span>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: "clamp(28px,4vw,40px)", lineHeight: 1.2, margin: "8px 0 16px" }}>
          Sua marca ao lado da conversa que o mercado está prevendo agora
        </h1>
        <p style={{ fontSize: 16, color: "var(--grafite)", maxWidth: "60ch" }}>
          O DitoFeito é um mercado de previsão por reputação — cada card de patrocínio
          fica junto de conteúdo que o visitante volta a conferir sempre que o
          preço de um mercado muda. Anúncio nativo, nunca pop-up.
        </p>
      </section>

      <section style={{ marginBottom: 48 }}>
        <span className="eyebrow">Onde seu anúncio aparece</span>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: "8px 0 20px" }}>3 formatos, direto no portal</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {PLANOS.map((p) => (
            <div key={p.id} className="card">
              <span className="badge">{p.local}</span>
              <p style={{ fontSize: 14, color: "var(--tinta)", margin: "12px 0 0" }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <span className="eyebrow">Planos mensais</span>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: "8px 0 4px" }}>Escolha e contrate</h2>
        <p className="hint-text" style={{ marginBottom: 20 }}>
          Preços de referência, negociáveis no contato. Cada plano libera um dos formatos
          e um limite de redes sociais no seu painel de autoatendimento.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          {PLANOS.map((p) => (
            <div
              key={p.id} className="card"
              style={p.destaque ? { borderColor: "var(--violeta)", boxShadow: "0 4px 16px rgba(79,46,153,.1)" } : undefined}
            >
              <h3 style={{ fontFamily: "var(--serif)", fontSize: 20, margin: "0 0 2px" }}>{p.nome}</h3>
              <p className="hint-text" style={{ marginBottom: 16 }}>{p.local}</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px", fontSize: 13.5, color: "var(--tinta)" }}>
                <li style={{ padding: "8px 0", borderBottom: "1px dashed var(--linha)" }}>{p.specs}</li>
                {p.extras.map((ex) => (
                  <li key={ex} style={{ padding: "8px 0", borderBottom: "1px dashed var(--linha)" }}>{ex}</li>
                ))}
              </ul>
              <p className="mono" style={{ fontSize: 20, fontWeight: 700, color: "var(--violeta)", marginBottom: 14 }}>{p.preco}</p>
              <button type="button" className="btn-outline" style={{ width: "100%" }} onClick={() => onEscolherPlano(p.id)}>
                Quero esse plano
              </button>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <div className="card" style={{ borderStyle: "dashed" }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 8px" }}>Neutralidade é o produto</h2>
          <p style={{ fontSize: 14, color: "var(--tinta)", maxWidth: "72ch" }}>
            O DitoFeito não aceita publicidade de candidatos, partidos, coligações,
            comitês financeiros ou empresas vinculadas a campanhas eleitorais. A
            credibilidade dos mercados depende da independência editorial — e ela
            protege também a sua marca. Aqui não existe dinheiro: pontos e reputação
            não têm valor monetário e não podem ser trocados, vendidos ou sacados
            (Lei 9.504/97).
          </p>
        </div>
      </section>

      <section id="contato" style={{ maxWidth: 480, margin: "0 auto 60px" }}>
        <div className="card">
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 20, margin: "0 0 4px" }}>Falar com o comercial</h2>
          <p className="hint-text" style={{ marginBottom: 20 }}>
            Preenche e a gente responde por e-mail.
          </p>
          {sent ? (
            <p style={{ color: "var(--conferido)", fontWeight: 500 }}>
              Recebido! Vamos entrar em contato em breve.
            </p>
          ) : (
            <form onSubmit={onSubmit}>
              <div className="field">
                <label className="label" htmlFor="lead-name">Seu nome</label>
                <input className="input" id="lead-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label" htmlFor="lead-company">Empresa</label>
                <input className="input" id="lead-company" value={company} onChange={(e) => setCompany(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label" htmlFor="lead-email">E-mail</label>
                <input className="input" id="lead-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label" htmlFor="lead-phone">Telefone (opcional)</label>
                <input className="input" id="lead-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="field">
                <label className="label" htmlFor="lead-plan">Plano de interesse</label>
                <select id="lead-plan" value={plan} onChange={(e) => setPlan(e.target.value as Plan | "")}>
                  <option value="">Ainda não sei</option>
                  {PLANOS.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="lead-message">Mensagem (opcional)</label>
                <textarea id="lead-message" value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
              <div className="field">
                <Turnstile onToken={setCaptchaToken} />
              </div>
              {err && <p className="error-text">{err}</p>}
              <button className="btn" disabled={createLead.isPending}>
                {createLead.isPending ? "Enviando…" : "Enviar"}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
