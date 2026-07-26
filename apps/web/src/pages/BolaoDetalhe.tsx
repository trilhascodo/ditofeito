import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { trpc } from "../lib/trpc";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Aberto pra palpite",
  AGUARDANDO_RESOLUCAO: "Aguardando resultado",
  RESOLVIDO: "Resolvido",
  VOID: "Anulado",
};

export function BolaoDetalhe() {
  const { groupId, bolaoId } = useParams<{ groupId: string; bolaoId: string }>();
  const utils = trpc.useUtils();
  const { data: bolao, isLoading } = trpc.groups.bolao.detail.useQuery({ bolaoId: bolaoId! }, { enabled: !!bolaoId });
  const submitMut = trpc.groups.bolao.submitPalpite.useMutation();
  const resolveExtraMut = trpc.groups.bolao.resolveExtra.useMutation();

  const [outcomeId, setOutcomeId] = useState("");
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
  const [number, setNumber] = useState("");
  const [palpiteErr, setPalpiteErr] = useState<string | null>(null);
  const [palpiteSaved, setPalpiteSaved] = useState(false);

  const [realHome, setRealHome] = useState("");
  const [realAway, setRealAway] = useState("");
  const [realNumber, setRealNumber] = useState("");
  const [resolveErr, setResolveErr] = useState<string | null>(null);

  async function onSubmitPalpite(e: FormEvent) {
    e.preventDefault();
    if (!bolaoId || !bolao) return;
    setPalpiteErr(null);
    try {
      await submitMut.mutateAsync({
        bolaoId,
        guessOutcomeId: bolao.guessType === "WINNER" ? outcomeId : undefined,
        guessHomeScore: bolao.guessType === "SCORE" ? Number(homeScore) : undefined,
        guessAwayScore: bolao.guessType === "SCORE" ? Number(awayScore) : undefined,
        guessNumber: bolao.guessType === "NUMBER" ? Number(number) : undefined,
      });
      setPalpiteSaved(true);
      await utils.groups.bolao.detail.invalidate({ bolaoId });
      setTimeout(() => setPalpiteSaved(false), 1500);
    } catch (err) {
      setPalpiteErr(err instanceof Error ? err.message : "Erro ao salvar palpite");
    }
  }

  async function onResolveExtra(e: FormEvent) {
    e.preventDefault();
    if (!bolaoId || !bolao) return;
    setResolveErr(null);
    try {
      await resolveExtraMut.mutateAsync({
        bolaoId,
        homeScore: bolao.guessType === "SCORE" ? Number(realHome) : undefined,
        awayScore: bolao.guessType === "SCORE" ? Number(realAway) : undefined,
        number: bolao.guessType === "NUMBER" ? Number(realNumber) : undefined,
      });
      await utils.groups.bolao.detail.invalidate({ bolaoId });
    } catch (err) {
      setResolveErr(err instanceof Error ? err.message : "Erro ao registrar resultado");
    }
  }

  if (isLoading) return <main className="page"><p className="hint-text">Carregando…</p></main>;
  if (!bolao) return <main className="page"><p className="hint-text">Bolão não encontrado.</p></main>;

  return (
    <main className="page">
      <Link to={`/grupos/${groupId}`} className="hint-text">← Voltar ao grupo</Link>
      <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: "8px 0 4px" }}>
        <Link to={`/m/${bolao.marketSlug}`}>{bolao.marketTitle}</Link>
      </h1>
      <p className="hint-text" style={{ marginBottom: 16 }}>
        <span className="badge">{STATUS_LABEL[bolao.status] ?? bolao.status}</span>
        {" · encerra em "}{new Date(bolao.closeAt).toLocaleString("pt-BR")}
      </p>

      {bolao.status === "OPEN" && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>
            {bolao.myGuess ? "Seu palpite (dá pra trocar até o prazo)" : "Dê seu palpite"}
          </h2>
          <form onSubmit={onSubmitPalpite}>
            {bolao.guessType === "WINNER" && (
              <div className="field">
                <label className="label" htmlFor="palpite-outcome">Quem ganha</label>
                <select
                  id="palpite-outcome" required
                  value={outcomeId || bolao.myGuess?.outcomeId || ""}
                  onChange={(e) => setOutcomeId(e.target.value)}
                >
                  <option value="" disabled>escolha…</option>
                  {bolao.outcomes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            )}
            {bolao.guessType === "SCORE" && (
              <div style={{ display: "flex", gap: 10 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label className="label" htmlFor="palpite-home">Placar mandante</label>
                  <input
                    className="input" id="palpite-home" type="number" min={0} required
                    value={homeScore || bolao.myGuess?.homeScore?.toString() || ""}
                    onChange={(e) => setHomeScore(e.target.value)}
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label className="label" htmlFor="palpite-away">Placar visitante</label>
                  <input
                    className="input" id="palpite-away" type="number" min={0} required
                    value={awayScore || bolao.myGuess?.awayScore?.toString() || ""}
                    onChange={(e) => setAwayScore(e.target.value)}
                  />
                </div>
              </div>
            )}
            {bolao.guessType === "NUMBER" && (
              <div className="field">
                <label className="label" htmlFor="palpite-number">Seu número</label>
                <input
                  className="input" id="palpite-number" type="number" required
                  value={number || bolao.myGuess?.number?.toString() || ""}
                  onChange={(e) => setNumber(e.target.value)}
                />
              </div>
            )}
            {palpiteErr && <p className="error-text">{palpiteErr}</p>}
            <button className="btn-outline" style={{ width: "auto", padding: "10px 18px" }} disabled={submitMut.isPending}>
              {submitMut.isPending ? "Salvando…" : palpiteSaved ? "Salvo!" : "Salvar palpite"}
            </button>
          </form>
        </div>
      )}

      {bolao.isCreator && bolao.status === "AGUARDANDO_RESOLUCAO" && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 4px" }}>Registrar resultado real</h2>
          <p className="hint-text" style={{ marginBottom: 12 }}>
            O mercado já foi resolvido — falta só você confirmar o valor exato pra fechar o bolão.
          </p>
          <form onSubmit={onResolveExtra}>
            {bolao.guessType === "SCORE" && (
              <div style={{ display: "flex", gap: 10 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label className="label" htmlFor="real-home">Placar mandante</label>
                  <input className="input" id="real-home" type="number" min={0} required value={realHome} onChange={(e) => setRealHome(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label className="label" htmlFor="real-away">Placar visitante</label>
                  <input className="input" id="real-away" type="number" min={0} required value={realAway} onChange={(e) => setRealAway(e.target.value)} />
                </div>
              </div>
            )}
            {bolao.guessType === "NUMBER" && (
              <div className="field">
                <label className="label" htmlFor="real-number">Número real</label>
                <input className="input" id="real-number" type="number" required value={realNumber} onChange={(e) => setRealNumber(e.target.value)} />
              </div>
            )}
            {resolveErr && <p className="error-text">{resolveErr}</p>}
            <button className="btn-outline" style={{ width: "auto", padding: "10px 18px" }} disabled={resolveExtraMut.isPending}>
              {resolveExtraMut.isPending ? "Salvando…" : "Fechar bolão"}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Palpites</h2>
        {!bolao.palpitesVisiveis ? (
          <p className="hint-text">
            {bolao.palpiteCount} de vocês já palpitaram — os palpites ficam escondidos até o prazo encerrar.
          </p>
        ) : bolao.palpites.length === 0 ? (
          <p className="hint-text">Ninguém palpitou neste bolão.</p>
        ) : (
          bolao.palpites.map((p) => {
            const venceu = bolao.vencedores.includes(p.userId);
            const outcomeLabel = bolao.outcomes.find((o) => o.id === p.guessOutcomeId)?.label;
            const palpiteTexto =
              bolao.guessType === "WINNER" ? outcomeLabel ?? "—"
              : bolao.guessType === "SCORE" ? `${p.guessHomeScore ?? "—"} x ${p.guessAwayScore ?? "—"}`
              : p.guessNumber ?? "—";
            return (
              <div key={p.userId} className="out" style={venceu ? { fontWeight: 600 } : undefined}>
                <span className="nome">
                  {p.displayName} <span className="hint-text">@{p.handle}</span>
                  {venceu && " 🏆"}
                </span>
                <span className="mono">{palpiteTexto}</span>
              </div>
            );
          })
        )}
        {bolao.status === "RESOLVIDO" && bolao.palpitesVisiveis && (
          <p className="hint-text" style={{ marginTop: 12 }}>
            {bolao.vencedores.length === 0
              ? "Ninguém acertou desta vez."
              : bolao.vencedores.length === 1
                ? "Temos um vencedor!"
                : `${bolao.vencedores.length} pessoas acertaram e dividem a vitória.`}
          </p>
        )}
      </div>
    </main>
  );
}
