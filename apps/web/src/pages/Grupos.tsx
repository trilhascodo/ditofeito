import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/useAuth";

export function Grupos() {
  const { user, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const { data: groups, isLoading } = trpc.groups.myGroups.useQuery(undefined, { enabled: !!user });
  const createMut = trpc.groups.create.useMutation();
  const joinMut = trpc.groups.joinByCode.useMutation();

  const [name, setName] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [joinErr, setJoinErr] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreateErr(null);
    try {
      await createMut.mutateAsync({ name: name.trim() });
      setName("");
      await utils.groups.myGroups.invalidate();
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : "Erro ao criar grupo");
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    setJoinErr(null);
    try {
      await joinMut.mutateAsync({ code: code.trim() });
      setCode("");
      await utils.groups.myGroups.invalidate();
    } catch (err) {
      setJoinErr(err instanceof Error ? err.message : "Código inválido");
    }
  }

  if (authLoading) return <main className="page"><p className="hint-text">Carregando…</p></main>;

  if (!user) {
    return (
      <main className="page-narrow">
        <div className="card">
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Grupos</h1>
          <p className="hint-text" style={{ marginBottom: 16 }}>
            Entre pra criar um grupo e disputar bolão com seus amigos.
          </p>
          <Link to="/entrar" className="btn" style={{ display: "block", textAlign: "center" }}>Entrar</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <h1 style={{ fontFamily: "var(--serif)", fontSize: 24, marginBottom: 16 }}>Grupos</h1>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Criar grupo</h2>
        <form onSubmit={onCreate} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 240px", marginBottom: 0 }}>
            <label className="label" htmlFor="grp-name">Nome do grupo</label>
            <input
              className="input" id="grp-name" placeholder="Bolão do escritório" required
              value={name} onChange={(e) => setName(e.target.value)}
            />
          </div>
          <button className="btn-outline" style={{ width: "auto", padding: "10px 18px" }} disabled={createMut.isPending}>
            {createMut.isPending ? "Criando…" : "Criar"}
          </button>
        </form>
        {createErr && <p className="error-text">{createErr}</p>}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Entrar com código de convite</h2>
        <form onSubmit={onJoin} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 240px", marginBottom: 0 }}>
            <label className="label" htmlFor="grp-code">Código</label>
            <input
              className="input" id="grp-code" placeholder="cole o código aqui" required
              value={code} onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <button className="btn-outline" style={{ width: "auto", padding: "10px 18px" }} disabled={joinMut.isPending}>
            {joinMut.isPending ? "Entrando…" : "Entrar"}
          </button>
        </form>
        {joinErr && <p className="error-text">{joinErr}</p>}
      </div>

      <div className="card">
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "0 0 12px" }}>Meus grupos</h2>
        {isLoading ? (
          <p className="hint-text">Carregando…</p>
        ) : !groups || groups.length === 0 ? (
          <p className="hint-text">Você ainda não está em nenhum grupo.</p>
        ) : (
          groups.map((g) => (
            <div key={g.id} className="out">
              <span className="nome">
                <Link to={`/grupos/${g.id}`}>{g.name}</Link>
                <br /><span className="hint-text">{g.memberCount} membro(s){g.isOwner ? " · você criou" : ""}</span>
              </span>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
