import { useState, type FormEvent } from "react";
import { trpc } from "../lib/trpc";
import { Turnstile } from "../components/Turnstile";

const CAPTCHA_REQUIRED = !!import.meta.env.VITE_TURNSTILE_SITE_KEY;

export function SolicitarMercado() {
  const createRequest = trpc.marketRequests.create.useMutation();

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [proposedTitle, setProposedTitle] = useState("");
  const [proposedCriteria, setProposedCriteria] = useState("");
  const [proposedSource, setProposedSource] = useState("");
  const [message, setMessage] = useState("");
  const [captchaToken, setCaptchaToken] = useState(CAPTCHA_REQUIRED ? "" : "dev");
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!captchaToken) { setErr("Confirme o captcha antes de enviar."); return; }
    try {
      await createRequest.mutateAsync({
        name: name.trim(), company: company.trim(), email: email.trim(),
        phone: phone.trim() || undefined,
        proposedTitle: proposedTitle.trim(), proposedCriteria: proposedCriteria.trim(),
        proposedSource: proposedSource.trim(), message: message.trim() || undefined,
        captchaToken,
      });
      setSent(true);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Erro ao enviar. Tenta de novo.");
    }
  }

  return (
    <main className="page">
      <section style={{ maxWidth: 720, margin: "12px 0 48px" }}>
        <span className="eyebrow">Solicitar criação de mercado</span>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: "clamp(28px,4vw,40px)", lineHeight: 1.2, margin: "8px 0 16px" }}>
          Sua pauta virando previsão pública, com metodologia aberta
        </h1>
        <p style={{ fontSize: 16, color: "var(--grafite)", maxWidth: "60ch" }}>
          Veículos de comunicação, agências e empresas podem contratar a criação de um mercado
          sobre um tema de interesse — publicado com o mesmo rigor editorial de todo o portal.
          Serviço pago, revisado por nós antes de publicar: nenhum mercado nasce sem critério
          de resolução verificável e fonte nomeada.
        </p>
      </section>

      <section style={{ marginBottom: 48, maxWidth: 720 }}>
        <div className="card" style={{ borderStyle: "dashed" }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 16, margin: "0 0 8px" }}>Como funciona</h2>
          <p style={{ fontSize: 14, color: "var(--tinta)" }}>
            Você propõe o tema, o critério de resolução e a fonte que vai decidir o resultado.
            Nossa equipe revisa — o mesmo padrão de qualquer mercado do portal — e só publica se
            passar pelas mesmas regras de evidência e responsabilidade. Preço é combinado no
            contato, conforme o alcance e a complexidade do mercado.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 480, margin: "0 auto 60px" }}>
        <div className="card">
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 20, margin: "0 0 4px" }}>Propor mercado</h2>
          <p className="hint-text" style={{ marginBottom: 20 }}>
            Preenche e a gente responde por e-mail com a viabilidade e o valor.
          </p>
          {sent ? (
            <p style={{ color: "var(--conferido)", fontWeight: 500 }}>
              Recebido! Vamos avaliar e entrar em contato em breve.
            </p>
          ) : (
            <form onSubmit={onSubmit}>
              <div className="field">
                <label className="label" htmlFor="mr-name">Seu nome</label>
                <input className="input" id="mr-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label" htmlFor="mr-company">Empresa/veículo</label>
                <input className="input" id="mr-company" value={company} onChange={(e) => setCompany(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label" htmlFor="mr-email">E-mail</label>
                <input className="input" id="mr-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label" htmlFor="mr-phone">Telefone (opcional)</label>
                <input className="input" id="mr-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="field">
                <label className="label" htmlFor="mr-title">Título proposto do mercado</label>
                <input
                  className="input" id="mr-title" placeholder="Ex.: X vai superar Y de audiência em 2026?"
                  value={proposedTitle} onChange={(e) => setProposedTitle(e.target.value)} required
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="mr-criteria">Critério de resolução proposto</label>
                <textarea
                  id="mr-criteria" placeholder="Como e quando isso vai ser considerado verdadeiro ou falso?"
                  value={proposedCriteria} onChange={(e) => setProposedCriteria(e.target.value)} required
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="mr-source">Fonte que vai decidir o resultado</label>
                <input
                  className="input" id="mr-source" placeholder="Ex.: Ibope, TSE, resultado oficial da emissora…"
                  value={proposedSource} onChange={(e) => setProposedSource(e.target.value)} required
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="mr-message">Mensagem (opcional)</label>
                <textarea id="mr-message" value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
              <div className="field">
                <Turnstile onToken={setCaptchaToken} />
              </div>
              {err && <p className="error-text">{err}</p>}
              <button className="btn" disabled={createRequest.isPending}>
                {createRequest.isPending ? "Enviando…" : "Enviar proposta"}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
