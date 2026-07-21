import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/useAuth";
import { UFS } from "../lib/ufs";
import { useUfGeolocation } from "../lib/useUfGeolocation";

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const pct = (p: number) => `${(p * 100).toFixed(p >= 0.1 ? 0 : 1)}%`;
const dataFmt = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const REASON_LABEL: Record<string, string> = {
  SIGNUP_BONUS: "Bônus de cadastro",
  DAILY_BONUS: "Bônus diário",
  TRADE_BUY: "Compra de posição",
  TRADE_SELL: "Venda de posição",
  RESOLUTION_PAYOUT: "Pagamento de resolução",
  MARKET_VOIDED: "Mercado anulado",
  ADMIN_ADJUST: "Ajuste administrativo",
};

const MARKET_STATUS_LABEL: Record<string, string> = {
  CLOSED: "ENCERRADO", RESOLVED: "RESOLVIDO", VOIDED: "ANULADO",
};

interface LedgerRow {
  id: string; delta: string; balance_after: string; reason: string; created_at: string;
}

export function Profile() {
  const { user, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const { data: me, isLoading: meLoading } = trpc.user.me.useQuery(undefined, { enabled: !!user });
  const { data: positions, isLoading: positionsLoading } = trpc.user.myPositions.useQuery(undefined, { enabled: !!user });
  const { data: ledger, isLoading: ledgerLoading } = trpc.user.myLedger.useQuery(undefined, { enabled: !!user });
  const setEmailNotifications = trpc.user.setEmailNotifications.useMutation();
  const setRegion = trpc.user.setRegion.useMutation();
  const setShareLocation = trpc.user.setShareLocationOnTrades.useMutation();
  const [emailNotif, setEmailNotif] = useState(true);
  const [regionUf, setRegionUf] = useState("");
  const [regionCity, setRegionCity] = useState("");
  const [regionSaved, setRegionSaved] = useState(false);
  const [shareLocation, setShareLocationState] = useState(false);
  const ufGeo = useUfGeolocation();
  const shareLocGeo = useUfGeolocation();

  useEffect(() => {
    if (me) setEmailNotif(me.emailNotifications);
  }, [me?.emailNotifications]);

  useEffect(() => {
    if (me) { setRegionUf(me.regionUf ?? ""); setRegionCity(me.regionCity ?? ""); }
  }, [me?.regionUf, me?.regionCity]);

  useEffect(() => {
    if (me) setShareLocationState(me.shareLocationOnTrades);
  }, [me?.shareLocationOnTrades]);

  async function onToggleEmailNotif() {
    const next = !emailNotif;
    setEmailNotif(next);
    await setEmailNotifications.mutateAsync({ enabled: next });
    await utils.user.me.invalidate();
  }

  async function onSaveRegion(e: FormEvent) {
    e.preventDefault();
    setRegionSaved(false);
    await setRegion.mutateAsync({ regionUf: regionUf || undefined, regionCity: regionCity.trim() || undefined });
    await utils.user.me.invalidate();
    setRegionSaved(true);
    setTimeout(() => setRegionSaved(false), 1500);
  }

  async function onToggleShareLocation() {
    if (shareLocation) {
      setShareLocationState(false);
      await setShareLocation.mutateAsync({ enabled: false });
      await utils.user.me.invalidate();
      return;
    }
    // Liga só se o navegador realmente conceder a permissão agora — o
    // toggle nunca fica "ativo" sem geolocalização de fato disponível.
    shareLocGeo.locate(async () => {
      setShareLocationState(true);
      await setShareLocation.mutateAsync({ enabled: true });
      await utils.user.me.invalidate();
    });
  }

  if (authLoading) return <main className="page"><p className="hint-text">Carregando…</p></main>;

  if (!user) {
    return (
      <main className="page-narrow">
        <div className="card">
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Seu perfil</h1>
          <p className="hint-text" style={{ marginBottom: 16 }}>Entre para ver suas posições e seu extrato.</p>
          <Link to="/entrar" className="btn" style={{ display: "block", textAlign: "center" }}>Entrar</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 24, margin: 0 }}>{user.displayName}</h1>
          <p className="hint-text" style={{ margin: "2px 0 0" }}>@{user.handle}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="mono" style={{ fontSize: 28, fontWeight: 600, color: "var(--violeta)" }}>
            {meLoading ? "—" : `${fmt(me?.balance ?? 0)} pts`}
          </div>
          <p className="hint-text" style={{ margin: 0 }}>saldo</p>
        </div>
      </div>

      {me?.reputation && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Reputação</h2>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            <div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{me.reputation.resolvedCount}</div>
              <p className="hint-text" style={{ margin: 0 }}>previsões resolvidas</p>
            </div>
            {me.reputation.brierMean !== null && (
              <div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{me.reputation.brierMean.toFixed(3)}</div>
                <p className="hint-text" style={{ margin: 0 }}>Brier médio (menor = melhor)</p>
              </div>
            )}
            <div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 600, color: me.reputation.skillScore >= 0 ? "var(--conferido)" : "var(--carimbo)" }}>
                {me.reputation.skillScore >= 0 ? "+" : ""}{me.reputation.skillScore.toFixed(3)}
              </div>
              <p className="hint-text" style={{ margin: 0 }}>skill vs. mercado</p>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{me.reputation.streakCurrent}</div>
              <p className="hint-text" style={{ margin: 0 }}>sequência atual (melhor: {me.reputation.streakBest})</p>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Notificações</h2>
        <label className="checkbox-row" style={{ marginBottom: 0 }}>
          <input type="checkbox" checked={emailNotif} onChange={onToggleEmailNotif} disabled={setEmailNotifications.isPending} />
          Avisar por e-mail quando um mercado que eu previ resolver ou for anulado
        </label>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 4px" }}>Região</h2>
        <p className="hint-text" style={{ marginBottom: 12 }}>
          Opcional, nunca é público — usado só pra mostrar patrocinadores e conteúdo relevante pra você.
        </p>
        <form onSubmit={onSaveRegion} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
            <label className="label" htmlFor="profile-uf">Estado</label>
            <select id="profile-uf" value={regionUf} onChange={(e) => setRegionUf(e.target.value)}>
              <option value="">prefiro não dizer</option>
              {UFS.map((uf) => <option key={uf.value} value={uf.value}>{uf.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
            <label className="label" htmlFor="profile-city">Cidade</label>
            <input className="input" id="profile-city" placeholder="Codó" value={regionCity} onChange={(e) => setRegionCity(e.target.value)} />
          </div>
          <button
            type="button" className="btn-outline"
            style={{ width: "auto", flex: "0 0 auto", padding: "10px 14px" }}
            disabled={ufGeo.status === "locating"}
            onClick={() => ufGeo.locate(setRegionUf)}
          >
            {ufGeo.status === "locating" ? "Localizando…" : "Usar minha localização"}
          </button>
          <button className="btn-outline" style={{ width: "auto", padding: "10px 18px" }} disabled={setRegion.isPending}>
            {setRegion.isPending ? "Salvando…" : regionSaved ? "Salvo!" : "Salvar"}
          </button>
        </form>
        {ufGeo.error && <p className="error-text" style={{ marginTop: 8 }}>{ufGeo.error}</p>}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 4px" }}>Localização nas previsões</h2>
        <p className="hint-text" style={{ marginBottom: 12 }}>
          Opcional. Se ativo, cada previsão que você registrar anexa a UF sugerida pela localização do
          seu dispositivo (nunca a cidade exata, nunca por usuário individual) — ajuda a mostrar de onde
          vêm as previsões de cada mercado, o que reforça a confiança no resultado.
        </p>
        <label className="checkbox-row" style={{ marginBottom: 0 }}>
          <input
            type="checkbox" checked={shareLocation}
            onChange={onToggleShareLocation}
            disabled={setShareLocation.isPending || shareLocGeo.status === "locating"}
          />
          Compartilhar minha localização a cada previsão
        </label>
        {shareLocGeo.error && <p className="error-text" style={{ marginTop: 8 }}>{shareLocGeo.error}</p>}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 4px" }}>Posições</h2>
        {positionsLoading ? (
          <p className="hint-text">Carregando…</p>
        ) : !positions || positions.length === 0 ? (
          <p className="hint-text">Nenhuma posição aberta ainda.</p>
        ) : (
          positions.map((p) => (
            <div key={`${p.marketSlug}-${p.outcomeId}`} className="out">
              <span className="nome">
                <Link to={`/m/${p.marketSlug}`}>{p.marketTitle}</Link>
                {p.marketStatus !== "OPEN" && (
                  <span className="badge" style={{ marginLeft: 8 }}>
                    {MARKET_STATUS_LABEL[p.marketStatus] ?? p.marketStatus}
                  </span>
                )}
                <br /><span className="hint-text">{p.outcomeLabel}</span>
              </span>
              <span className="mono" style={{ textAlign: "right" }}>
                {fmt(p.shares)} posições
                {p.currentPrice !== null && <><br /><span className="hint-text">{pct(p.currentPrice)}</span></>}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 4px" }}>Extrato</h2>
        {ledgerLoading ? (
          <p className="hint-text">Carregando…</p>
        ) : !ledger || ledger.length === 0 ? (
          <p className="hint-text">Nada por aqui ainda.</p>
        ) : (
          (ledger as LedgerRow[]).map((entry) => {
            const delta = Number(entry.delta);
            return (
              <div key={entry.id} className="out">
                <span className="nome">
                  {REASON_LABEL[entry.reason] ?? entry.reason}
                  <br /><span className="hint-text">{dataFmt(entry.created_at)}</span>
                </span>
                <span className={`mono ${delta >= 0 ? "up" : "down"}`} style={{ textAlign: "right" }}>
                  {delta >= 0 ? "+" : ""}{fmt(delta)}
                  <br /><span className="hint-text">saldo {fmt(Number(entry.balance_after))}</span>
                </span>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
