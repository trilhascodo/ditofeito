import { useState } from "react";
import { Link } from "react-router-dom";
import { sharesForPoints, tradeCost } from "@ditofeito/core";

const ATUALIZADO = "20 de julho de 2026";

// Demo pedagógica, não um mercado real — b ilustrativo (mesma ordem de
// grandeza do GERADOR_CONFIG.depthBinario usado nos binários eleitorais de
// verdade), só pra dar intuição de como o preço reage a pontos comprometidos.
const DEMO_B = 40;

function DemoLmsr() {
  const [pontos, setPontos] = useState(60);
  const q = [0, 0];
  const shares = sharesForPoints(q, DEMO_B, 0, pontos);
  const { pricesAfter } = tradeCost(q, DEMO_B, 0, shares);
  const novoPreco = pricesAfter[0];

  return (
    <div className="card" style={{ margin: "16px 0" }}>
      <p style={{ fontSize: 13, color: "var(--grafite)", marginBottom: 12 }}>
        Mercado hipotético, 50/50 no início. Arraste pra ver quanto o preço se
        move quando alguém compromete pontos no SIM:
      </p>
      <input
        type="range" min={0} max={300} step={10} value={pontos}
        onChange={(e) => setPontos(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--violeta)" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 13, color: "var(--grafite)" }}>
        <span><b className="mono" style={{ color: "var(--tinta)" }}>{pontos}</b> pontos comprometidos no SIM</span>
        <span>chance de SIM: <b className="mono" style={{ color: "var(--violeta)", fontSize: 16 }}>{(novoPreco * 100).toFixed(1)}%</b></span>
      </div>
    </div>
  );
}

const VOCABULARIO: [string, string][] = [
  ["Nunca use", "\"pesquisa\", \"pesquisa eleitoral\", \"intenção de voto\", \"X lidera com Y%\""],
  ["Use", "\"o mercado precifica\", \"probabilidade implícita\", \"palpite\", \"chance de SIM\""],
  ["Nunca use", "\"aposta\", \"aposte\", \"ganhe dinheiro\", \"odds\""],
  ["Use", "\"previsão\", \"registre seu palpite\", \"pontos\", \"reputação\""],
];

export function Metodologia() {
  return (
    <main className="legal">
      <h1>Metodologia</h1>
      <p className="atualizado">Última atualização: {ATUALIZADO}</p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0 24px" }}>
        {["NÃO É PESQUISA", "NÃO É APOSTA", "É REPUTAÇÃO"].map((t) => (
          <span
            key={t}
            className="mono"
            style={{
              fontSize: 12, fontWeight: 700, color: "var(--violeta)",
              border: "1.5px solid var(--violeta)", borderRadius: 6,
              padding: "6px 12px", letterSpacing: ".04em",
            }}
          >
            {t}
          </span>
        ))}
      </div>

      <p style={{ fontSize: 16, lineHeight: 1.55 }}>
        Em uma frase: no DitoFeito você registra um palpite com pontos (sem
        valor em dinheiro), e a porcentagem que aparece em cada mercado é a
        soma de todos os palpites — não uma pesquisa com amostra, não uma
        aposta com dinheiro real. Os detalhes de como isso funciona por
        dentro estão abaixo, pra quem for citar ou cobrir a plataforma.
      </p>

      <h2>1. O que é</h2>
      <p>
        O DitoFeito é um mercado de previsão por reputação: qualquer pessoa
        registra um palpite sobre eleições, esportes ou cultura usando
        pontos (sem valor monetário), e a probabilidade exibida em cada
        mercado nasce da soma desses palpites, não de uma amostra
        representativa entrevistada — por isso não é pesquisa eleitoral, e
        por não envolver dinheiro real, não é aposta.
      </p>

      <h2>2. Como o preço é formado</h2>
      <p>
        Cada mercado usa uma fórmula chamada LMSR (Logarithmic Market Scoring
        Rule): quanto mais pontos um lado recebe, mais caro fica prever
        nesse lado e mais barato fica prever no outro — o preço é sempre a
        probabilidade implícita do momento, atualizada a cada palpite
        registrado, nunca uma média fixa.
      </p>
      <DemoLmsr />

      <h2>3. Pontos não são dinheiro</h2>
      <p>
        Pontos são uma unidade interna, fictícia. Não têm valor monetário,
        não podem ser comprados, vendidos, trocados por dinheiro ou qualquer
        bem, nem sacados, em nenhuma hipótese. O DitoFeito não processa
        pagamento nem tem gateway de pagamento na arquitetura — não existe
        "sacar" o que quer que seja.
      </p>

      <h2>4. Como um mercado é resolvido</h2>
      <p>
        Todo mercado nasce com critério de resolução e fonte de verificação
        públicos, visíveis antes de qualquer palpite. Resolução é sempre
        manual e assinada — feita pela equipe editorial (papéis internos
        ADMIN/MODERATOR/RESOLVER), nunca automática — com justificativa e
        link de fonte publicados junto do resultado. Se um mercado deixar de
        fazer sentido (ex.: candidato retira candidatura antes do prazo),
        ele é <b>anulado</b>: os pontos comprometidos voltam a quem previu,
        e o motivo fica registrado publicamente na própria página do
        mercado.
      </p>

      <h2>5. Reputação</h2>
      <p>
        Cada previsão resolvida gera um Brier score — quanto mais calibrado
        o palpite (não só "acertou", mas acertou com a confiança certa),
        melhor a reputação. Reputação acumulada e sequência de acertos
        aparecem no perfil de cada pessoa e no{" "}
        <Link to="/ranking">ranking público</Link>. É o mecanismo de prova
        social da plataforma: quem prevê bem constrói histórico verificável,
        não anônimo.
      </p>

      <h2>6. Moderação</h2>
      <p>
        Comentários citam a posição de quem escreveu (previsão + reputação
        no momento do post) — "put your money where your mouth is" sem
        dinheiro de verdade. Qualquer pessoa pode denunciar um comentário;
        denúncia nunca oculta sozinha, sempre passa por revisão humana da
        equipe editorial antes de qualquer ação.
      </p>

      <h2>7. Patrocínio e neutralidade editorial</h2>
      <p>
        O DitoFeito não aceita publicidade de candidato, partido, coligação,
        comitê financeiro ou empresa vinculada a campanha eleitoral — em
        nenhum mercado, nem no site como um todo. A credibilidade dos
        mercados depende da independência editorial entre quem opera a
        plataforma e o que ela mede.{" "}
        <Link to="/anuncie">Detalhes em Anuncie</Link>.
      </p>

      <h2>8. Para imprensa e blogs</h2>
      <p>
        Se for citar ou embutir dados do DitoFeito, o vocabulário abaixo
        evita confusão com pesquisa eleitoral registrada (Lei 9.504/97) ou
        casa de apostas — nenhum dos dois é o que o produto é:
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", margin: "12px 0" }}>
        <tbody>
          {VOCABULARIO.map(([tipo, termos], i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--linha)" }}>
              <td style={{ padding: "8px 12px 8px 0", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", verticalAlign: "top" }}>
                {tipo}
              </td>
              <td style={{ padding: "8px 0", fontSize: 13.5, color: "var(--tinta)" }}>{termos}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Todo card e widget compartilhável (imagem, iframe) já leva o aviso
        "agregado de opiniões de participantes, não é pesquisa eleitoral"
        quando o mercado é eleitoral — não precisa reescrever, só manter.
        Dúvida específica de enquadramento: <b>contato@ditofeito.com.br</b>.
      </p>
    </main>
  );
}
