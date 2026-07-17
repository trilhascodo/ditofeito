import { useEffect, useState, type FormEvent } from "react";
import { trpc } from "../lib/trpc";

export function AdminEmailSettings() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.emailSettings.get.useQuery();
  const updateMutation = trpc.emailSettings.update.useMutation();
  const testMutation = trpc.emailSettings.sendTest.useMutation();

  const [fromAddress, setFromAddress] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setFromAddress(data.fromAddress);
  }, [data?.fromAddress]);

  async function refresh() {
    await utils.emailSettings.get.invalidate();
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setMsg(null); setErr(null);
    try {
      await updateMutation.mutateAsync({ fromAddress, apiKey: apiKey.trim() || undefined });
      setApiKey("");
      setMsg("Salvo.");
      await refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro ao salvar");
    }
  }

  async function onClearKey() {
    if (!confirm("Remover a chave configurada? O envio volta pro modo padrão (variável de ambiente da VPS, ou log em dev).")) return;
    setMsg(null); setErr(null);
    try {
      await updateMutation.mutateAsync({ fromAddress, clearApiKey: true });
      setMsg("Chave removida.");
      await refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro ao remover");
    }
  }

  async function onSendTest() {
    setTestMsg(null); setTestErr(null);
    try {
      const r = await testMutation.mutateAsync();
      setTestMsg(`Enviado pra ${r.to}. Confira sua caixa de entrada.`);
    } catch (e2) {
      setTestErr(e2 instanceof Error ? e2.message : "Erro ao enviar teste");
    }
  }

  if (isLoading || !data) return <div className="card"><p className="hint-text">Carregando…</p></div>;

  return (
    <div>
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: 0 }}>E-mail transacional</h1>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Configuração (Resend)</h2>
        <p className="hint-text" style={{ marginBottom: 12 }}>
          {data.hasApiKey
            ? "Chave configurada. Deixe o campo em branco pra manter a atual."
            : "Sem chave configurada aqui — usando a variável de ambiente da VPS, ou modo dev (loga no console)."}
        </p>
        <form onSubmit={onSave}>
          <div className="field">
            <label className="label" htmlFor="es-from">Remetente</label>
            <input className="input" id="es-from" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label" htmlFor="es-key">API key da Resend</label>
            <input
              className="input" id="es-key" type="password" autoComplete="off"
              placeholder={data.hasApiKey ? "•••• configurada — deixe em branco pra manter" : "re_..."}
              value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          {msg && <p className="hint-text" style={{ color: "var(--conferido)" }}>{msg}</p>}
          {err && <p className="error-text">{err}</p>}
          <div className="form-actions">
            <button className="btn" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando…" : "Salvar"}
            </button>
            {data.hasApiKey && (
              <button type="button" className="btn-outline btn-danger" onClick={onClearKey} disabled={updateMutation.isPending}>
                Remover chave
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Testar envio</h2>
        <p className="hint-text" style={{ marginBottom: 12 }}>
          Manda um e-mail de teste pro seu próprio endereço de conta.
        </p>
        {testMsg && <p className="hint-text" style={{ color: "var(--conferido)" }}>{testMsg}</p>}
        {testErr && <p className="error-text">{testErr}</p>}
        <button className="btn-outline" style={{ width: "auto", padding: "10px 16px" }} onClick={onSendTest} disabled={testMutation.isPending}>
          {testMutation.isPending ? "Enviando…" : "Enviar e-mail de teste"}
        </button>
      </div>
    </div>
  );
}
