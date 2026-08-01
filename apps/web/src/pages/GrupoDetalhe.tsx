import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { trpc } from "../lib/trpc";

const dataFmt = (d: string | Date) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Aberto pra palpite",
  AGUARDANDO_RESOLUCAO: "Aguardando resultado",
  RESOLVIDO: "Resolvido",
  VOID: "Anulado",
};

const GUESS_TYPE_LABEL: Record<string, string> = {
  WINNER: "Quem ganha",
  SCORE: "Placar exato",
  NUMBER: "Número (ex.: diferença de votos)",
};

export function GrupoDetalhe() {
  const { groupId } = useParams<{ groupId: string }>();
  const utils = trpc.useUtils();
  const { data: group, isLoading } = trpc.groups.detail.useQuery({ groupId: groupId! }, { enabled: !!groupId });

  const [copiado, setCopiado] = useState(false);
  const [showCriar, setShowCriar] = useState(false);
  const [bolaoKind, setBolaoKind] = useState<"MARKET" | "CUSTOM">("MARKET");
  const [busca, setBusca] = useState("");
  const [marketId, setMarketId] = useState<string | null>(null);
  const [marketTitle, setMarketTitle] = useState("");
  const [guessType, setGuessType] = useState<"WINNER" | "SCORE" | "NUMBER">("WINNER");
  const [criarErr, setCriarErr] = useState<string | null>(null);

  // Bolão de evento próprio do grupo (sem mercado curado por trás).
  const [customTitle, setCustomTitle] = useState("");
  const [customCriteria, setCustomCriteria] = useState("");
  const [customCloseAt, setCustomCloseAt] = useState("");
  const [customOutcomes, setCustomOutcomes] = useState(["", ""]);

  const { data: mercados } = trpc.market.list.useQuery(
    { q: busca, status: "OPEN" },
    { enabled: busca.trim().length >= 2 },
  );
  const createBolaoMut = trpc.groups.bolao.create.useMutation();

  const { data: posts, isLoading: postsLoading } = trpc.groups.posts.list.useQuery(
    { groupId: groupId! }, { enabled: !!groupId },
  );
  const createPostMut = trpc.groups.posts.create.useMutation();
  const [postBody, setPostBody] = useState("");
  const [postErr, setPostErr] = useState<string | null>(null);

  async function onPost(e: FormEvent) {
    e.preventDefault();
    if (!groupId) return;
    setPostErr(null);
    const body = postBody.trim();
    if (!body) return;
    try {
      await createPostMut.mutateAsync({ groupId, body });
      setPostBody("");
      await utils.groups.posts.list.invalidate({ groupId });
    } catch (err) {
      setPostErr(err instanceof Error ? err.message : "Erro ao postar");
    }
  }

  const inviteUrl = group ? `${window.location.origin}/convite/${group.inviteCode}` : "";
  const inviteText = group ? `Bora participar do grupo "${group.name}" comigo no Dito!` : "";

  function onCopyInvite() {
    if (!group) return;
    navigator.clipboard?.writeText(inviteUrl);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  function onShareNative() {
    if (!group) return;
    navigator.share?.({ title: inviteText, url: inviteUrl }).catch(() => {});
  }

  async function onCriarBolao() {
    if (!groupId) return;
    setCriarErr(null);
    try {
      if (bolaoKind === "MARKET") {
        if (!marketId) return;
        await createBolaoMut.mutateAsync({ kind: "MARKET", groupId, marketId, guessType });
        setMarketId(null);
        setMarketTitle("");
        setBusca("");
      } else {
        await createBolaoMut.mutateAsync({
          kind: "CUSTOM", groupId, guessType,
          title: customTitle, criteria: customCriteria,
          closeAt: new Date(customCloseAt).toISOString(),
          outcomes: guessType === "WINNER" ? customOutcomes.map((o) => o.trim()).filter(Boolean) : undefined,
        });
        setCustomTitle("");
        setCustomCriteria("");
        setCustomCloseAt("");
        setCustomOutcomes(["", ""]);
      }
      setShowCriar(false);
      await utils.groups.detail.invalidate({ groupId });
    } catch (err) {
      setCriarErr(err instanceof Error ? err.message : "Erro ao criar bolão");
    }
  }

  function onUpdateOutcome(i: number, value: string) {
    setCustomOutcomes((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }
  function onAddOutcome() {
    setCustomOutcomes((prev) => [...prev, ""]);
  }
  function onRemoveOutcome(i: number) {
    setCustomOutcomes((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  if (isLoading) return <main className="page"><p className="hint-text">Carregando…</p></main>;
  if (!group) return <main className="page"><p className="hint-text">Grupo não encontrado.</p></main>;

  const bolaoPendente = group.boloes.find((b) => b.status === "OPEN" && !b.hasMyGuess);

  return (
    <main className="page">
      <Link to="/grupos" className="hint-text">← Meus grupos</Link>
      <h1 style={{ fontFamily: "var(--serif)", fontSize: 24, margin: "8px 0 16px" }}>{group.name}</h1>

      {bolaoPendente && (
        <div className="card" style={{ marginBottom: 20, borderColor: "var(--violeta)" }}>
          <p className="hint-text" style={{ margin: "0 0 8px" }}>Tem bolão esperando seu palpite:</p>
          <Link
            to={`/grupos/${groupId}/bolao/${bolaoPendente.id}`}
            className="btn" style={{ display: "inline-block", width: "auto", padding: "10px 18px" }}
          >
            Dar meu palpite: {bolaoPendente.marketTitle}
          </Link>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Membros ({group.members.length})</h2>
        {group.members.map((m) => (
          <div key={m.handle} className="out">
            <span className="nome">{m.displayName} <span className="hint-text">@{m.handle}</span></span>
          </div>
        ))}
        <hr style={{ border: "none", borderTop: "1px solid var(--linha)", margin: "16px 0" }} />
        <p className="hint-text" style={{ marginBottom: 8 }}>Convide gente pro grupo — não precisa ter conta ainda:</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <a
            className="btn-outline" style={{ width: "auto" }}
            href={`https://wa.me/?text=${encodeURIComponent(`${inviteText} ${inviteUrl}`)}`}
            target="_blank" rel="noopener noreferrer"
          >
            WhatsApp
          </a>
          <a
            className="btn-outline" style={{ width: "auto" }}
            href={`https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(inviteText)}`}
            target="_blank" rel="noopener noreferrer"
          >
            Telegram
          </a>
          <a
            className="btn-outline" style={{ width: "auto" }}
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(inviteUrl)}`}
            target="_blank" rel="noopener noreferrer"
          >
            Facebook
          </a>
          {typeof navigator !== "undefined" && !!navigator.share && (
            <button type="button" className="btn-outline" style={{ width: "auto" }} onClick={onShareNative}>
              Compartilhar…
            </button>
          )}
          <button type="button" className="btn-outline" style={{ width: "auto" }} onClick={onCopyInvite}>
            {copiado ? "Copiado!" : "Copiar link"}
          </button>
        </div>
        <p className="hint-text" style={{ marginBottom: 4 }}>
          Ou passe o código pra quem já tem conta:{" "}
          <code className="mono" style={{ padding: "3px 8px", background: "var(--fundo-alt, #f4f4f4)", borderRadius: 6 }}>
            {group.inviteCode}
          </code>
        </p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Mural</h2>
        <form onSubmit={onPost} style={{ marginBottom: 16 }}>
          <div className="field" style={{ marginBottom: 8 }}>
            <textarea
              className="input" rows={2} placeholder="Combina os detalhes do bolão, avisa a galera…"
              value={postBody} onChange={(e) => setPostBody(e.target.value)}
            />
          </div>
          {postErr && <p className="error-text">{postErr}</p>}
          <button className="btn-outline" style={{ width: "auto", padding: "8px 16px" }} disabled={createPostMut.isPending || !postBody.trim()}>
            {createPostMut.isPending ? "Postando…" : "Postar"}
          </button>
        </form>
        {postsLoading ? (
          <p className="hint-text">Carregando…</p>
        ) : !posts || posts.length === 0 ? (
          <p className="hint-text">Nenhum recado ainda — comece a conversa.</p>
        ) : (
          posts.map((p) => (
            <div key={p.id} className="out">
              <span className="nome">
                {p.displayName} <span className="hint-text">@{p.handle} · {dataFmt(p.createdAt)}</span>
                <br />{p.body}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: 0 }}>Bolões</h2>
          <button type="button" className="btn-outline" style={{ width: "auto", padding: "8px 14px" }} onClick={() => setShowCriar((v) => !v)}>
            {showCriar ? "Cancelar" : "Criar bolão"}
          </button>
        </div>

        {showCriar && (
          <div style={{ marginBottom: 20, padding: 14, border: "1px solid var(--linha)", borderRadius: 8 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button
                type="button" className={bolaoKind === "MARKET" ? "btn" : "btn-outline"}
                style={{ width: "auto", padding: "6px 14px" }}
                onClick={() => setBolaoKind("MARKET")}
              >
                Mercado existente
              </button>
              <button
                type="button" className={bolaoKind === "CUSTOM" ? "btn" : "btn-outline"}
                style={{ width: "auto", padding: "6px 14px" }}
                onClick={() => setBolaoKind("CUSTOM")}
              >
                Evento do grupo
              </button>
            </div>

            {bolaoKind === "MARKET" ? (
              <>
                <div className="field">
                  <label className="label" htmlFor="bolao-busca">Buscar mercado (aberto)</label>
                  <input
                    className="input" id="bolao-busca" placeholder="ex.: Flamengo, Tarcísio, Braide..."
                    value={busca}
                    onChange={(e) => { setBusca(e.target.value); setMarketId(null); }}
                  />
                </div>
                {marketId ? (
                  <p className="hint-text">Selecionado: <strong>{marketTitle}</strong> — <button type="button" className="link-btn" onClick={() => setMarketId(null)}>trocar</button></p>
                ) : (
                  mercados && mercados.length > 0 && (
                    <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 12 }}>
                      {mercados.map((m) => (
                        <div
                          key={m.id} className="out" style={{ cursor: "pointer" }}
                          onClick={() => { setMarketId(m.id); setMarketTitle(m.title); }}
                        >
                          <span className="nome">{m.title}</span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </>
            ) : (
              <>
                <p className="hint-text" style={{ marginBottom: 12 }}>
                  Um evento que só interessa ao grupo — sem depender de mercado nenhum do catálogo.
                  Você mesmo confirma o resultado depois que o prazo encerrar.
                </p>
                <div className="field">
                  <label className="label" htmlFor="custom-title">Título</label>
                  <input
                    className="input" id="custom-title" placeholder="ex.: Quem ganha o campeonato de sinuca do escritório"
                    value={customTitle} onChange={(e) => setCustomTitle(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="custom-criteria">Critério de resolução</label>
                  <textarea
                    className="input" id="custom-criteria" rows={2}
                    placeholder="O que define o resultado — pra não ter dúvida na hora de fechar"
                    value={customCriteria} onChange={(e) => setCustomCriteria(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="custom-close">Prazo pra palpitar</label>
                  <input
                    className="input" id="custom-close" type="datetime-local"
                    value={customCloseAt} onChange={(e) => setCustomCloseAt(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="field">
              <label className="label" htmlFor="bolao-tipo">Tipo de palpite</label>
              <select id="bolao-tipo" value={guessType} onChange={(e) => setGuessType(e.target.value as typeof guessType)}>
                {Object.entries(GUESS_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            {bolaoKind === "CUSTOM" && guessType === "WINNER" && (
              <div className="field">
                <label className="label">Opções</label>
                {customOutcomes.map((o, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <input
                      className="input" placeholder={`Opção ${i + 1}`}
                      value={o} onChange={(e) => onUpdateOutcome(i, e.target.value)}
                    />
                    {customOutcomes.length > 2 && (
                      <button type="button" className="link-btn" onClick={() => onRemoveOutcome(i)}>remover</button>
                    )}
                  </div>
                ))}
                <button type="button" className="link-btn" onClick={onAddOutcome}>+ adicionar opção</button>
              </div>
            )}

            {criarErr && <p className="error-text">{criarErr}</p>}
            <button
              className="btn-outline" style={{ width: "auto", padding: "10px 18px" }}
              disabled={
                createBolaoMut.isPending
                || (bolaoKind === "MARKET" ? !marketId : !customTitle.trim() || !customCriteria.trim() || !customCloseAt)
              }
              onClick={onCriarBolao}
            >
              {createBolaoMut.isPending ? "Criando…" : "Criar bolão"}
            </button>
          </div>
        )}

        {group.boloes.length === 0 ? (
          <p className="hint-text">Nenhum bolão ainda.</p>
        ) : (
          group.boloes.map((b) => (
            <div key={b.id} className="out">
              <span className="nome">
                <Link to={`/grupos/${groupId}/bolao/${b.id}`}>{b.marketTitle}</Link>
                <br /><span className="hint-text">{GUESS_TYPE_LABEL[b.guessType]} · {b.palpiteCount} palpite(s)</span>
              </span>
              <span className="badge">{STATUS_LABEL[b.status] ?? b.status}</span>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
