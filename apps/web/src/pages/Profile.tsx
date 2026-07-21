import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/useAuth";
import { UFS } from "../lib/ufs";
import { useUfGeolocation } from "../lib/useUfGeolocation";
import { logout } from "../lib/auth";

const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;

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
  const { user, isLoading: authLoading, refresh } = useAuth();
  const utils = trpc.useUtils();
  const { data: me, isLoading: meLoading } = trpc.user.me.useQuery(undefined, { enabled: !!user });
  const { data: positions, isLoading: positionsLoading } = trpc.user.myPositions.useQuery(undefined, { enabled: !!user });
  const { data: ledger, isLoading: ledgerLoading } = trpc.user.myLedger.useQuery(undefined, { enabled: !!user });
  const setEmailNotifications = trpc.user.setEmailNotifications.useMutation();
  const setRegion = trpc.user.setRegion.useMutation();
  const setShareLocation = trpc.user.setShareLocationOnTrades.useMutation();
  const updateProfileMut = trpc.user.updateProfile.useMutation();
  const changePasswordMut = trpc.user.changePassword.useMutation();
  const requestEmailChangeMut = trpc.user.requestEmailChange.useMutation();
  const deleteAccountMut = trpc.user.deleteAccount.useMutation();
  const [emailNotif, setEmailNotif] = useState(true);
  const [regionUf, setRegionUf] = useState("");
  const [regionCity, setRegionCity] = useState("");
  const [regionSaved, setRegionSaved] = useState(false);
  const [shareLocation, setShareLocationState] = useState(false);
  const ufGeo = useUfGeolocation();
  const shareLocGeo = useUfGeolocation();

  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordErr, setPasswordErr] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  useEffect(() => {
    if (me) setEmailNotif(me.emailNotifications);
  }, [me?.emailNotifications]);

  useEffect(() => {
    if (me) { setRegionUf(me.regionUf ?? ""); setRegionCity(me.regionCity ?? ""); }
  }, [me?.regionUf, me?.regionCity]);

  useEffect(() => {
    if (me) setShareLocationState(me.shareLocationOnTrades);
  }, [me?.shareLocationOnTrades]);

  useEffect(() => {
    if (user) { setHandle(user.handle); setDisplayName(user.displayName); }
  }, [user?.handle, user?.displayName]);

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

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileErr(null);
    setProfileSaved(false);
    if (!HANDLE_PATTERN.test(handle)) {
      setProfileErr("Nome de usuário: 3–30 caracteres, letras minúsculas, números e _");
      return;
    }
    try {
      await updateProfileMut.mutateAsync({ handle, displayName });
      await Promise.all([utils.user.me.invalidate(), refresh()]);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 1500);
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordErr(null);
    setPasswordSaved(false);
    if (newPassword.length < 8) {
      setPasswordErr("Nova senha precisa de pelo menos 8 caracteres");
      return;
    }
    try {
      await changePasswordMut.mutateAsync({
        currentPassword: me?.hasPassword ? currentPassword : undefined,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      await utils.user.me.invalidate();
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 2000);
    } catch (err) {
      setPasswordErr(err instanceof Error ? err.message : "Erro ao trocar a senha");
    }
  }

  async function onRequestEmailChange(e: FormEvent) {
    e.preventDefault();
    setEmailErr(null);
    try {
      await requestEmailChangeMut.mutateAsync({
        newEmail, password: me?.hasPassword ? emailPassword : undefined,
      });
      setEmailSent(true);
    } catch (err) {
      setEmailErr(err instanceof Error ? err.message : "Erro ao pedir a troca de e-mail");
    }
  }

  async function onDeleteAccount(e: FormEvent) {
    e.preventDefault();
    setDeleteErr(null);
    try {
      await deleteAccountMut.mutateAsync({ password: me?.hasPassword ? deletePassword : undefined });
      await logout();
      window.location.href = "/";
    } catch (err) {
      setDeleteErr(err instanceof Error ? err.message : "Erro ao apagar a conta");
    }
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

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Conta</h2>

        <form onSubmit={onSaveProfile} style={{ marginBottom: 20 }}>
          <div className="field">
            <label className="label" htmlFor="acc-handle">Nome de usuário</label>
            <input
              className="input" id="acc-handle" required
              value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="acc-displayName">Nome de exibição</label>
            <input
              className="input" id="acc-displayName" required
              value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          {profileErr && <p className="error-text">{profileErr}</p>}
          <button className="btn-outline" style={{ width: "auto", padding: "10px 18px" }} disabled={updateProfileMut.isPending}>
            {updateProfileMut.isPending ? "Salvando…" : profileSaved ? "Salvo!" : "Salvar"}
          </button>
        </form>

        <hr style={{ border: "none", borderTop: "1px solid var(--linha)", margin: "20px 0" }} />

        <form onSubmit={onRequestEmailChange} style={{ marginBottom: 20 }}>
          <div className="field">
            <label className="label" htmlFor="acc-email">E-mail</label>
            <p className="hint-text" style={{ margin: "0 0 8px" }}>Atual: {me?.email ?? "…"}</p>
            <input
              className="input" id="acc-email" type="email" placeholder="novo@email.com" required
              value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          {me?.hasPassword && (
            <div className="field">
              <label className="label" htmlFor="acc-email-pw">Senha atual</label>
              <input
                className="input" id="acc-email-pw" type="password" required
                value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)}
              />
            </div>
          )}
          {emailErr && <p className="error-text">{emailErr}</p>}
          {emailSent ? (
            <p className="hint-text">
              Mandamos um link de confirmação pro e-mail novo — clique nele pra concluir a troca.
            </p>
          ) : (
            <button
              className="btn-outline" style={{ width: "auto", padding: "10px 18px" }}
              disabled={requestEmailChangeMut.isPending}
            >
              {requestEmailChangeMut.isPending ? "Enviando…" : "Trocar e-mail"}
            </button>
          )}
        </form>

        <hr style={{ border: "none", borderTop: "1px solid var(--linha)", margin: "20px 0" }} />

        <form onSubmit={onChangePassword}>
          {me?.hasPassword && (
            <div className="field">
              <label className="label" htmlFor="acc-cur-pw">Senha atual</label>
              <input
                className="input" id="acc-cur-pw" type="password" autoComplete="current-password" required
                value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
          )}
          <div className="field">
            <label className="label" htmlFor="acc-new-pw">{me?.hasPassword ? "Nova senha" : "Definir senha"}</label>
            <input
              className="input" id="acc-new-pw" type="password" autoComplete="new-password" minLength={8} required
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          {passwordErr && <p className="error-text">{passwordErr}</p>}
          <button className="btn-outline" style={{ width: "auto", padding: "10px 18px" }} disabled={changePasswordMut.isPending}>
            {changePasswordMut.isPending ? "Salvando…" : passwordSaved ? "Salvo!" : me?.hasPassword ? "Trocar senha" : "Definir senha"}
          </button>
        </form>
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

      <div className="card" style={{ marginTop: 20, borderColor: "var(--carimbo)" }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 4px" }}>Apagar conta</h2>
        <p className="hint-text" style={{ marginBottom: 12 }}>
          Remove seu nome, e-mail, CPF e demais dados de identificação. Comentários e previsões que você
          já fez continuam públicos por transparência (mesma regra de auditoria da plataforma), mas
          aparecem como "Conta removida". Essa ação não pode ser desfeita.
        </p>
        {!deleteConfirming ? (
          <button
            type="button" className="btn-outline btn-danger" style={{ width: "auto", padding: "10px 18px" }}
            onClick={() => setDeleteConfirming(true)}
          >
            Apagar minha conta
          </button>
        ) : (
          <form onSubmit={onDeleteAccount}>
            {me?.hasPassword && (
              <div className="field">
                <label className="label" htmlFor="del-pw">Confirme sua senha</label>
                <input
                  className="input" id="del-pw" type="password" required
                  value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)}
                />
              </div>
            )}
            {deleteErr && <p className="error-text">{deleteErr}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn-outline btn-danger" style={{ width: "auto", padding: "10px 18px" }}
                disabled={deleteAccountMut.isPending}
              >
                {deleteAccountMut.isPending ? "Apagando…" : "Confirmar remoção definitiva"}
              </button>
              <button
                type="button" className="btn-outline" style={{ width: "auto" }}
                onClick={() => setDeleteConfirming(false)}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
