import { Link, useNavigate, useParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/useAuth";

export const PENDING_INVITE_KEY = "pendingInviteCode";

export function EntrarGrupo() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { data: preview, isLoading, error } = trpc.groups.previewByCode.useQuery(
    { code: code! }, { enabled: !!code, retry: false },
  );
  const joinMut = trpc.groups.joinByCode.useMutation();

  async function onEntrar() {
    if (!code) return;
    const g = await joinMut.mutateAsync({ code });
    navigate(`/grupos/${g.id}`);
  }

  function onQuerCriarConta() {
    if (code) localStorage.setItem(PENDING_INVITE_KEY, code);
  }

  if (isLoading || authLoading) return <main className="page-narrow"><p className="hint-text">Carregando…</p></main>;

  if (error || !preview) {
    return (
      <main className="page-narrow">
        <div className="card">
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Convite inválido</h1>
          <p className="hint-text">Esse link de convite não existe mais ou está errado.</p>
          <Link to="/" className="btn-outline" style={{ display: "block", textAlign: "center", marginTop: 12 }}>
            Ir pra página inicial
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-narrow">
      <div className="card">
        <span className="eyebrow">Você foi convidado</span>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, margin: "6px 0 4px" }}>{preview.name}</h1>
        <p className="hint-text" style={{ marginBottom: 16 }}>
          Criado por {preview.creatorDisplayName} · {preview.memberCount} membro{preview.memberCount === 1 ? "" : "s"}
          {preview.activeBoloesCount > 0
            ? ` · ${preview.activeBoloesCount} bolão${preview.activeBoloesCount === 1 ? "" : "ões"} rolando`
            : ""}
        </p>

        {user ? (
          <>
            {joinMut.error && <p className="error-text">{joinMut.error.message}</p>}
            <button className="btn" onClick={onEntrar} disabled={joinMut.isPending}>
              {joinMut.isPending ? "Entrando…" : "Entrar no grupo"}
            </button>
          </>
        ) : (
          <>
            <p className="hint-text" style={{ marginBottom: 12 }}>
              Crie sua conta (ou entre, se já tem) pra participar do bolão com esse grupo.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link to="/cadastro" className="btn" style={{ flex: "1 1 auto", textAlign: "center" }} onClick={onQuerCriarConta}>
                Criar conta
              </Link>
              <Link to="/entrar" className="btn-outline" style={{ flex: "1 1 auto", textAlign: "center" }} onClick={onQuerCriarConta}>
                Já tenho conta
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
