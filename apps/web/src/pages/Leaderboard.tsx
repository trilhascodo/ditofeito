import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/useAuth";

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

export function Leaderboard() {
  const { user } = useAuth();
  const { data, isLoading, error } = trpc.user.leaderboard.useQuery({ limit: 50 });

  return (
    <main className="page-narrow">
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 24, marginTop: 0, marginBottom: 4 }}>Ranking</h1>
        <p className="hint-text" style={{ marginBottom: 16 }}>
          Quem mais acerta previsões no DitoFeito, pelo skill score (desempenho contra o
          consenso do mercado). Só entra quem já resolveu {data?.minResolved ?? 5}+ previsões
          — pra não deixar 1 acerto de sorte virar 1º lugar.
        </p>

        {user && data && (
          <p className="hint-text" style={{ marginBottom: 16 }}>
            {data.myRank ? (
              <>Sua posição: <b style={{ color: "var(--tinta)" }}>#{data.myRank}</b></>
            ) : (
              "Você ainda não entrou no ranking — resolva mais previsões pra qualificar."
            )}
          </p>
        )}

        {isLoading && <p className="hint-text">Carregando…</p>}
        {error && <p className="error-text">Não deu pra carregar o ranking agora.</p>}
        {data && data.rows.length === 0 && (
          <p className="hint-text">Ninguém qualificou ainda — seja o primeiro a resolver {data.minResolved}+ previsões.</p>
        )}

        {data && data.rows.length > 0 && (
          <div className="ranking-list">
            {data.rows.map((r) => (
              <div key={r.handle} className={`ranking-row${user?.handle === r.handle ? " ranking-row-mine" : ""}`}>
                <span className="ranking-pos">{r.rank}</span>
                <span className="ranking-avatar">
                  {r.avatarUrl ? <img src={r.avatarUrl} alt="" /> : initials(r.displayName)}
                </span>
                <span className="ranking-nome">
                  {r.displayName}
                  <br /><span className="hint-text">@{r.handle}</span>
                </span>
                <span className="ranking-stat">
                  <b className={`mono ${r.skillScore >= 0 ? "up" : "down"}`}>
                    {r.skillScore >= 0 ? "+" : ""}{r.skillScore.toFixed(3)}
                  </b>
                  <span className="hint-text">skill</span>
                </span>
                <span className="ranking-stat">
                  <b className="mono">{r.resolvedCount}</b>
                  <span className="hint-text">resolvidas</span>
                </span>
                <span className="ranking-stat">
                  <b className="mono">{r.streakCurrent}</b>
                  <span className="hint-text">sequência</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
