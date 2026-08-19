import { useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/useAuth";
import { ShareRow } from "../components/ShareRow";

type GuessType = "WINNER" | "SCORE" | "NUMBER";

type BolaoTemplate = {
  id: string;
  label: string;
  guessType: GuessType;
  outcomes?: string[];
  titlePlaceholder: string;
  criteriaPlaceholder: string;
};

// Mesmo conjunto de atalhos de apps/web/src/pages/GrupoDetalhe.tsx (bolão
// "Evento do grupo") — duplicado de propósito em vez de compartilhado: aqui
// não existe o toggle Mercado/Evento nem a busca de mercado, então extrair um
// componente comum só pra 4 campos + esses templates criaria mais indireção
// do que economiza.
const BOLAO_TEMPLATES: BolaoTemplate[] = [
  {
    id: "simnao", label: "Sim ou não", guessType: "WINNER", outcomes: ["Sim", "Não"],
    titlePlaceholder: "ex.: Vai chover na festa junina do bairro?",
    criteriaPlaceholder: "O que confirma o \"sim\" — pra não ter dúvida na hora de fechar",
  },
  {
    id: "cabecaacabeca", label: "Cabeça a cabeça", guessType: "WINNER", outcomes: ["", ""],
    titlePlaceholder: "ex.: Quem vai ganhar a eleição pro conselho do condomínio",
    criteriaPlaceholder: "Como se decide o vencedor entre os dois",
  },
  {
    id: "enquete", label: "Enquete", guessType: "WINNER", outcomes: ["", "", ""],
    titlePlaceholder: "ex.: Qual vai ser o próximo destino da viagem do grupo",
    criteriaPlaceholder: "Como e quando o resultado vai ser confirmado",
  },
  {
    id: "placar", label: "Placar exato", guessType: "SCORE",
    titlePlaceholder: "ex.: Flamengo x Palmeiras — placar final",
    criteriaPlaceholder: "ex.: Placar ao fim dos 90 minutos, sem prorrogação",
  },
  {
    id: "numero", label: "Número", guessType: "NUMBER",
    titlePlaceholder: "ex.: Quantos gols o Flamengo faz na rodada",
    criteriaPlaceholder: "O que exatamente está sendo contado",
  },
];

export function CriarEnquete() {
  const { user, isLoading: authLoading } = useAuth();
  const createMut = trpc.groups.createEnquete.useMutation();

  const [templateId, setTemplateId] = useState<string | null>(null);
  const [guessType, setGuessType] = useState<GuessType>("WINNER");
  const [title, setTitle] = useState("");
  const [criteria, setCriteria] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const [outcomes, setOutcomes] = useState(["", ""]);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ groupId: string; inviteCode: string } | null>(null);

  const activeTemplate = BOLAO_TEMPLATES.find((t) => t.id === templateId) ?? null;

  function onPickTemplate(t: BolaoTemplate) {
    setTemplateId(t.id);
    setGuessType(t.guessType);
    if (t.outcomes) setOutcomes(t.outcomes);
  }
  function onUpdateOutcome(i: number, value: string) {
    setOutcomes((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }
  function onAddOutcome() {
    setOutcomes((prev) => [...prev, ""]);
  }
  function onRemoveOutcome(i: number) {
    setOutcomes((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function onCriar() {
    setErr(null);
    try {
      const r = await createMut.mutateAsync({
        guessType, title, criteria,
        closeAt: new Date(closeAt).toISOString(),
        outcomes: guessType === "WINNER" ? outcomes.map((o) => o.trim()).filter(Boolean) : undefined,
      });
      setResult({ groupId: r.groupId, inviteCode: r.inviteCode });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao criar enquete");
    }
  }

  if (authLoading) return <main className="page-narrow"><p className="hint-text">Carregando…</p></main>;

  if (!user) {
    return (
      <main className="page-narrow">
        <div className="card">
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Criar enquete</h1>
          <p className="hint-text" style={{ marginBottom: 16 }}>
            Entre pra criar sua enquete — conta verificada é o que garante 1 pessoa = 1 palpite,
            mesmo divulgando o link fora do DitoFeito.
          </p>
          <Link to="/entrar" className="btn" style={{ display: "block", textAlign: "center" }}>Entrar</Link>
        </div>
      </main>
    );
  }

  if (result) {
    const inviteUrl = `${window.location.origin}/convite/${result.inviteCode}`;
    const shareText = `Vota na minha enquete: "${title}" — no DitoFeito`;
    return (
      <main className="page-narrow">
        <div className="card">
          <span className="eyebrow">Enquete no ar</span>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: "6px 0 12px" }}>{title}</h1>
          <p className="hint-text" style={{ marginBottom: 16 }}>
            Já dá pra divulgar — quem clicar vê a pergunta, entra com conta verificada e palpita.
            Sem cadastro repetido, sem voto duplicado.
          </p>
          <div style={{ marginBottom: 16 }}>
            <ShareRow
              url={inviteUrl} text={shareText}
              imageUrl={`${window.location.origin}/card/convite/${result.inviteCode}.png`}
              label="Divulgar:"
            />
          </div>
          <Link to={`/grupos/${result.groupId}`} className="btn-outline" style={{ display: "block", textAlign: "center" }}>
            Acompanhar palpites
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-narrow">
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Criar enquete</h1>
        <p className="hint-text" style={{ marginBottom: 16 }}>
          Pra divulgar no Instagram, WhatsApp, onde quiser — com a credibilidade de voto
          verificado, sem gente votando duas vezes com conta fake. Você mesmo confirma o
          resultado depois que o prazo encerrar.
        </p>

        <div className="field">
          <label className="label">Modelo (opcional — só pra começar mais rápido)</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {BOLAO_TEMPLATES.map((t) => (
              <button
                key={t.id} type="button"
                className={templateId === t.id ? "btn" : "btn-outline"}
                style={{ width: "auto", padding: "5px 12px", fontSize: 13 }}
                onClick={() => onPickTemplate(t)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="enq-title">Título</label>
          <input
            className="input" id="enq-title"
            placeholder={activeTemplate?.titlePlaceholder ?? "ex.: Quem ganha o campeonato de sinuca do escritório"}
            value={title} onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="enq-criteria">Critério de resolução</label>
          <textarea
            className="input" id="enq-criteria" rows={2}
            placeholder={activeTemplate?.criteriaPlaceholder ?? "O que define o resultado — pra não ter dúvida na hora de fechar"}
            value={criteria} onChange={(e) => setCriteria(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="enq-close">Prazo pra palpitar</label>
          <input
            className="input" id="enq-close" type="datetime-local"
            value={closeAt} onChange={(e) => setCloseAt(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="enq-tipo">Tipo de palpite</label>
          <select
            id="enq-tipo" value={guessType}
            onChange={(e) => { setGuessType(e.target.value as GuessType); setTemplateId(null); }}
          >
            <option value="WINNER">Quem ganha</option>
            <option value="SCORE">Placar exato</option>
            <option value="NUMBER">Número (ex.: diferença de votos)</option>
          </select>
        </div>

        {guessType === "WINNER" && (
          <div className="field">
            <label className="label">Opções</label>
            {outcomes.map((o, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <input
                  className="input" placeholder={`Opção ${i + 1}`}
                  value={o} onChange={(e) => onUpdateOutcome(i, e.target.value)}
                />
                {outcomes.length > 2 && (
                  <button type="button" className="link-btn" onClick={() => onRemoveOutcome(i)}>remover</button>
                )}
              </div>
            ))}
            <button type="button" className="link-btn" onClick={onAddOutcome}>+ adicionar opção</button>
          </div>
        )}

        {err && <p className="error-text">{err}</p>}
        <button
          className="btn" disabled={createMut.isPending || !title.trim() || !criteria.trim() || !closeAt}
          onClick={onCriar}
        >
          {createMut.isPending ? "Criando…" : "Criar e divulgar"}
        </button>
      </div>
    </main>
  );
}
