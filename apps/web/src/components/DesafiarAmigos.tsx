import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/useAuth";
import { rememberReturnTo } from "../lib/attribution";
import { ShareRow } from "./ShareRow";

// "Desafiar amigos" (groups.challenge, 046_grupo_desafio.sql). Link público
// de mercado quase não converte (funil 2026-09: 0,5% chegava ao cadastro);
// convite de alguém conhecido pra "ver quem acerta" pede a participação da
// pessoa, e entrar exige conta. Um clique cria o grupo-desafio com o bolão
// deste mercado e mostra os botões de compartilhar com o link do convite
// (ShareRow já marca ?origem= por canal).
export function DesafiarAmigos({ marketId, marketTitle, returnPath }: {
  marketId: string; marketTitle: string; returnPath: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const challenge = trpc.groups.challenge.useMutation();
  const [convite, setConvite] = useState<{ groupId: string; bolaoId: string; inviteCode: string } | null>(null);

  async function onDesafiar() {
    if (!user) {
      rememberReturnTo(returnPath);
      navigate("/cadastro");
      return;
    }
    setConvite(await challenge.mutateAsync({ marketId }));
  }

  if (!convite) {
    return (
      <div className="desafio-cta">
        <div>
          <b>Acha que acerta mais que seus amigos?</b>
          <p className="hint-text" style={{ margin: "2px 0 0" }}>
            Crie um desafio neste mercado e mande pro grupo — cada um dá o palpite e o resultado mostra quem acertou.
          </p>
        </div>
        <button type="button" className="btn" style={{ width: "auto", flex: "none", padding: "10px 18px" }}
                onClick={onDesafiar} disabled={challenge.isPending}>
          {challenge.isPending ? "Criando…" : "Desafiar amigos"}
        </button>
        {challenge.error && <p className="error-text" style={{ flexBasis: "100%" }}>{challenge.error.message}</p>}
      </div>
    );
  }

  const url = `${window.location.origin}/convite/${convite.inviteCode}`;
  return (
    <div className="desafio-cta desafio-cta-pronto">
      <div style={{ flexBasis: "100%" }}>
        <b>Desafio criado — agora mande pros amigos:</b>
        <p className="hint-text" style={{ margin: "2px 0 10px" }}>
          Quem entrar pelo seu convite ganha 50 pontos, e você ganha 100 por pessoa.
        </p>
        <ShareRow url={url} text={`Te desafio: "${marketTitle}" — vamos ver quem acerta. Dá seu palpite:`} label="" />
        <p className="hint-text" style={{ margin: "10px 0 0" }}>
          Não esqueça do seu:{" "}
          <Link to={`/grupos/${convite.groupId}/bolao/${convite.bolaoId}`}>dar meu palpite no desafio</Link>
        </p>
      </div>
    </div>
  );
}
