import { useState } from "react";
import { trpc } from "../lib/trpc";

const OFFICE_LABEL = {
  PRESIDENTE: "Presidente", GOVERNADOR: "Governador(a)", SENADOR: "Senador(a)",
  DEP_FEDERAL: "Deputado(a) Federal", DEP_ESTADUAL: "Deputado(a) Estadual",
  PREFEITO: "Prefeito(a)", VEREADOR: "Vereador(a)",
} as const;
type Office = keyof typeof OFFICE_LABEL;

const STATUS_LABEL = {
  PRE_ANUNCIADO: "Pré-anunciado", PRE_REIVINDICADO: "Pré-reivindicado",
  REGISTRADO: "Registrado", DEFERIDO: "Deferido",
  INDEFERIDO: "Indeferido", RENUNCIOU: "Renunciou/abandonou",
  FALECIDO: "Faleceu", NAO_REGISTROU: "Não registrou",
} as const;
type Status = keyof typeof STATUS_LABEL;

// Status que tiram o candidato da disputa — únicos que updateStatus deixa
// escolher no form de "marcar saída" (mesmo conjunto de EXIT_STATUSES no
// backend, ver routers/candidate.ts). Trocar pra REGISTRADO/DEFERIDO (segue
// na disputa) não anula nada, então não precisa desse form dedicado.
const EXIT_STATUS_LABEL = {
  INDEFERIDO: STATUS_LABEL.INDEFERIDO, RENUNCIOU: STATUS_LABEL.RENUNCIOU,
  FALECIDO: STATUS_LABEL.FALECIDO, NAO_REGISTROU: STATUS_LABEL.NAO_REGISTROU,
} as const;

// Cadastro direto pelo admin (candidate.create) — a base vinha só de
// sugestão/importação e deixava candidato real de fora da disputa sem
// nenhum jeito de incluir. Já roda o gerador no backend, então a pessoa
// entra como opção do "quem vence" existente na hora.
function AddCandidateForm({ onDone }: { onDone: () => void }) {
  const createMutation = trpc.candidate.create.useMutation();
  const [name, setName] = useState("");
  const [publicName, setPublicName] = useState("");
  const [party, setParty] = useState("");
  const [office, setOffice] = useState<Office>("GOVERNADOR");
  const [uf, setUf] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [candidacyStatus, setCandidacyStatus] = useState<"REGISTRADO" | "PRE_ANUNCIADO">("REGISTRADO");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      const r = await createMutation.mutateAsync({
        name: name.trim(), publicName: publicName.trim() || undefined, party: party.trim(),
        office, uf: office === "PRESIDENTE" ? undefined : uf, sourceUrl: sourceUrl.trim(), candidacyStatus,
      });
      setMsg(
        r.gerador.outcomesSincronizados > 0
          ? `Adicionado e incluído em ${r.gerador.outcomesSincronizados} mercado(s) "quem vence" já existente(s).`
          : "Adicionado. Se a disputa já tem mercado \"quem vence\" e o nome não entrou, confira se a "
            + "pessoa já não estava na base (veio do TSE) — ou, se é pré-candidato, a disputa já tem 12 "
            + "pré-candidatos (registrado no TSE sempre entra).",
      );
      setName(""); setPublicName(""); setParty(""); setSourceUrl("");
      onDone();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Erro ao adicionar candidato");
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginBottom: 16, padding: 12, border: "1px solid var(--linha)", borderRadius: 8 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: "2 1 220px" }}>
          <label className="label" htmlFor="ac-name">Nome completo</label>
          <input id="ac-name" className="input" required minLength={3} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field" style={{ flex: "2 1 180px" }}>
          <label className="label" htmlFor="ac-public">Nome de urna (opcional)</label>
          <input
            id="ac-public" className="input" placeholder="Policial Edjane"
            value={publicName} onChange={(e) => setPublicName(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: "1 1 100px" }}>
          <label className="label" htmlFor="ac-party">Partido</label>
          <input id="ac-party" className="input" required value={party} onChange={(e) => setParty(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: "1 1 160px" }}>
          <label className="label" htmlFor="ac-office">Cargo</label>
          <select id="ac-office" value={office} onChange={(e) => setOffice(e.target.value as Office)}>
            {Object.entries(OFFICE_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        {office !== "PRESIDENTE" && (
          <div className="field" style={{ flex: "0 1 90px" }}>
            <label className="label" htmlFor="ac-uf">UF</label>
            <input
              id="ac-uf" className="input" required minLength={2} maxLength={2}
              value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())}
            />
          </div>
        )}
        <div className="field" style={{ flex: "1 1 160px" }}>
          <label className="label" htmlFor="ac-status">Situação</label>
          <select
            id="ac-status" value={candidacyStatus}
            onChange={(e) => setCandidacyStatus(e.target.value as "REGISTRADO" | "PRE_ANUNCIADO")}
          >
            <option value="REGISTRADO">Registrado no TSE</option>
            <option value="PRE_ANUNCIADO">Pré-candidato</option>
          </select>
        </div>
        <div className="field" style={{ flex: "2 1 220px" }}>
          <label className="label" htmlFor="ac-source">Fonte (link)</label>
          <input
            id="ac-source" className="input" type="url" required placeholder="https://divulgacandcontas.tse.jus.br/..."
            value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)}
          />
        </div>
      </div>
      {err && <p className="error-text">{err}</p>}
      {msg && <p style={{ color: "var(--conferido)", fontSize: 13 }}>{msg}</p>}
      <button className="btn-outline" type="submit" style={{ width: "auto", padding: "8px 16px" }} disabled={createMutation.isPending}>
        {createMutation.isPending ? "Adicionando…" : "Adicionar candidato"}
      </button>
    </form>
  );
}

export function AdminCandidates() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<Status>("PRE_ANUNCIADO");
  const [office, setOffice] = useState<Office | "">("");
  const [uf, setUf] = useState("");
  const [search, setSearch] = useState("");
  const { data: candidates, isLoading } = trpc.candidate.list.useQuery({
    status,
    office: office || undefined,
    uf: uf.length === 2 ? uf : undefined,
    search: search.trim() || undefined,
  });
  const removeMutation = trpc.candidate.remove.useMutation();
  const runGeradorMutation = trpc.candidate.runGerador.useMutation();
  const updateStatusMutation = trpc.candidate.updateStatus.useMutation();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeErr, setRemoveErr] = useState<string | null>(null);
  const [geradorMsg, setGeradorMsg] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [exitFormId, setExitFormId] = useState<string | null>(null);
  const [exitStatus, setExitStatus] = useState<keyof typeof EXIT_STATUS_LABEL>("RENUNCIOU");
  const [exitJustification, setExitJustification] = useState("");
  const [exitSourceUrl, setExitSourceUrl] = useState("");
  const [exitErr, setExitErr] = useState<string | null>(null);
  const [exitResult, setExitResult] = useState<{
    voidedMarkets: string[]; skippedMarkets: string[]; removedFromMarkets: string[]; deletedDrafts: string[];
  } | null>(null);

  async function onRemove(id: string) {
    if (!confirm("Remover essa sugestão de pré-candidato?")) return;
    setRemovingId(id);
    setRemoveErr(null);
    try {
      await removeMutation.mutateAsync({ id });
      await utils.candidate.list.invalidate();
    } catch (err) {
      setRemoveErr(err instanceof Error ? err.message : "Erro ao remover sugestão");
    } finally {
      setRemovingId(null);
    }
  }

  async function onRunGerador() {
    setGeradorMsg(null);
    const r = await runGeradorMutation.mutateAsync();
    setGeradorMsg(`${r.binarios} binário(s) e ${r.multis} disputa(s) criados (${r.outcomesSincronizados} outcome(s) sincronizado(s)).`);
    await utils.candidate.list.invalidate();
  }

  function onOpenExitForm(id: string) {
    setExitFormId(id);
    setExitStatus("RENUNCIOU");
    setExitJustification("");
    setExitSourceUrl("");
    setExitErr(null);
    setExitResult(null);
  }

  async function onSubmitExit(id: string) {
    setExitErr(null);
    try {
      const r = await updateStatusMutation.mutateAsync({
        id, candidacyStatus: exitStatus,
        justification: exitJustification.trim(), sourceUrl: exitSourceUrl.trim(),
      });
      setExitResult({
        voidedMarkets: r.voidedMarkets, skippedMarkets: r.skippedMarkets,
        removedFromMarkets: r.removedFromMarkets, deletedDrafts: r.deletedDrafts,
      });
      await utils.candidate.list.invalidate();
    } catch (err) {
      setExitErr(err instanceof Error ? err.message : "Erro ao atualizar status");
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: "0 0 4px" }}>Candidatos</h1>
          <p className="hint-text" style={{ marginBottom: 12 }}>
            Fila de moderação de sugestões e manutenção de status (desistência, indeferimento, etc.).
          </p>
          <button
            type="button" className="btn-outline" style={{ padding: "8px 14px", fontSize: 13, width: "auto", marginBottom: 12 }}
            onClick={() => setShowAdd((v) => !v)}
          >
            {showAdd ? "Fechar" : "+ Adicionar candidato"}
          </button>
        </div>
        <div style={{ textAlign: "right" }}>
          <button
            type="button" className="btn-outline" style={{ padding: "10px 16px", fontSize: 13, width: "auto" }}
            onClick={onRunGerador} disabled={runGeradorMutation.isPending}
          >
            {runGeradorMutation.isPending ? "Rodando…" : "Rodar gerador agora"}
          </button>
          <p className="hint-text" style={{ marginTop: 6, maxWidth: 260 }}>
            Normalmente roda sozinho às 6h — usa isso pra criar mercado na hora
            pra pré-candidato recém-cadastrado, sem esperar o cron.
          </p>
          {geradorMsg && <p style={{ color: "var(--conferido)", fontSize: 13, marginTop: 4 }}>{geradorMsg}</p>}
        </div>
      </div>

      {showAdd && <AddCandidateForm onDone={() => utils.candidate.list.invalidate()} />}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          className="input" style={{ flex: "2 1 200px" }} type="search" placeholder="Buscar por nome…"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <select style={{ flex: "1 1 160px" }} value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          {Object.entries(STATUS_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <select style={{ flex: "1 1 160px" }} value={office} onChange={(e) => setOffice(e.target.value as Office | "")}>
          <option value="">todos os cargos</option>
          {Object.entries(OFFICE_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <input
          className="input" style={{ flex: "0 1 90px" }} maxLength={2} placeholder="UF"
          value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())}
        />
      </div>

      {removeErr && <p className="error-text">{removeErr}</p>}
      {isLoading && <p className="hint-text">Carregando…</p>}
      {candidates && candidates.length === 0 && <p className="hint-text">Nada com esse filtro.</p>}
      {candidates?.map((c) => (
        <div key={c.id} style={{ borderBottom: "1px solid var(--linha)", padding: "10px 0" }}>
          <div className="admin-row" style={{ border: "none", padding: 0 }}>
            <span className="titulo">
              {c.name} {c.public_name ? `(${c.public_name})` : ""}
              <div className="meta">
                {(OFFICE_LABEL as Record<string, string>)[c.office] ?? c.office}{c.uf ? `/${c.uf}` : ""} · {c.party} ·{" "}
                {STATUS_LABEL[c.candidacy_status as Status] ?? c.candidacy_status} ·{" "}
                <a href={c.source_url} target="_blank" rel="noopener noreferrer">fonte</a>
              </div>
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button" className="btn-outline" style={{ padding: "8px 14px", fontSize: 13 }}
                onClick={() => (exitFormId === c.id ? setExitFormId(null) : onOpenExitForm(c.id))}
              >
                {exitFormId === c.id ? "Cancelar" : "Marcar saída da disputa"}
              </button>
              {status === "PRE_ANUNCIADO" && (
                c.has_market_outcome ? (
                  <span className="hint-text" style={{ fontSize: 13, textAlign: "right", maxWidth: 220 }}>
                    Já virou mercado — não dá pra remover a sugestão.
                  </span>
                ) : (
                  <button
                    className="btn-outline btn-danger" style={{ padding: "8px 14px", fontSize: 13 }}
                    onClick={() => onRemove(c.id)} disabled={removingId === c.id}
                  >
                    {removingId === c.id ? "Removendo…" : "Remover"}
                  </button>
                )
              )}
            </div>
          </div>

          {exitFormId === c.id && (
            <div style={{ marginTop: 10, padding: 12, border: "1px solid var(--linha)", borderRadius: 8 }}>
              {exitResult ? (
                <div>
                  <p style={{ margin: "0 0 6px", color: "var(--conferido)" }}>Status atualizado.</p>
                  {exitResult.voidedMarkets.length > 0 && (
                    <p className="hint-text" style={{ margin: "0 0 4px" }}>
                      Mercado(s) anulado(s): {exitResult.voidedMarkets.join(", ")}
                    </p>
                  )}
                  {exitResult.removedFromMarkets.length > 0 && (
                    <p className="hint-text" style={{ margin: "0 0 4px" }}>
                      Removido da lista de candidatos de: {exitResult.removedFromMarkets.join(", ")}
                    </p>
                  )}
                  {exitResult.deletedDrafts.length > 0 && (
                    <p className="hint-text" style={{ margin: "0 0 4px" }}>
                      Rascunho(s) apagado(s): {exitResult.deletedDrafts.join(", ")}
                    </p>
                  )}
                  {exitResult.skippedMarkets.length > 0 && (
                    <p className="hint-text" style={{ margin: 0 }}>
                      Já tem aposta nesse candidato — não dá pra tirá-lo de:{" "}
                      {exitResult.skippedMarkets.join(", ")}. Decida manualmente (anular o mercado
                      inteiro devolve os pontos de todo mundo).
                    </p>
                  )}
                  {exitResult.voidedMarkets.length === 0 && exitResult.skippedMarkets.length === 0
                    && exitResult.removedFromMarkets.length === 0 && exitResult.deletedDrafts.length === 0 && (
                    <p className="hint-text" style={{ margin: 0 }}>Esse candidato ainda não tinha mercado gerado.</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="field">
                    <label className="label">Novo status</label>
                    <select value={exitStatus} onChange={(e) => setExitStatus(e.target.value as keyof typeof EXIT_STATUS_LABEL)}>
                      {Object.entries(EXIT_STATUS_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label">Justificativa</label>
                    <textarea
                      className="input" rows={2} placeholder="O que aconteceu, com detalhe suficiente pra ser público"
                      value={exitJustification} onChange={(e) => setExitJustification(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label className="label">Fonte (link)</label>
                    <input
                      className="input" type="url" placeholder="https://..."
                      value={exitSourceUrl} onChange={(e) => setExitSourceUrl(e.target.value)}
                    />
                  </div>
                  <p className="hint-text" style={{ marginBottom: 10 }}>
                    Ele sai da lista de candidatos dos mercados da disputa ("quem vence" / "mais
                    votado"), desde que ninguém tenha apostado nele — se já houver aposta, o
                    mercado aparece aqui pra você decidir.
                  </p>
                  {exitErr && <p className="error-text">{exitErr}</p>}
                  <button
                    className="btn-outline" style={{ width: "auto", padding: "8px 16px" }}
                    disabled={updateStatusMutation.isPending || exitJustification.trim().length < 10 || !exitSourceUrl.trim()}
                    onClick={() => onSubmitExit(c.id)}
                  >
                    {updateStatusMutation.isPending ? "Salvando…" : "Confirmar saída"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
