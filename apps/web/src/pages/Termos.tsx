import { Link } from "react-router-dom";

const ATUALIZADO = "18 de julho de 2026";

export function Termos() {
  return (
    <main className="legal">
      <h1>Termos de uso e Política de Privacidade</h1>
      <p className="atualizado">Última atualização: {ATUALIZADO}</p>
      <nav>
        <a href="#termos">Termos de uso</a>
        <a href="#privacidade">Política de privacidade</a>
      </nav>

      <p>
        O DitoFeito é operado por <b>HOSTGOV INOVA SIMPLES (I.S.)</b>, CNPJ
        52.584.900/0001-27, sediada em Codó/MA. Este documento foi escrito
        pela própria equipe a partir de como o produto funciona de fato —
        não substitui aconselhamento jurídico formal, e pode ser revisado por
        advogado antes de mudanças relevantes no produto.
      </p>

      <h2 id="termos">Termos de uso</h2>

      <h3>O que é o DitoFeito</h3>
      <p>
        O DitoFeito é um mercado de previsão por reputação: você registra
        previsões sobre eleições, esportes e cultura usando pontos, e sua
        reputação sobe ou desce conforme suas previsões se confirmam. Não é
        um jogo de azar nem uma casa de apostas.
      </p>

      <h3>Pontos não são dinheiro</h3>
      <p>
        Pontos são uma unidade interna, fictícia, usada só pra registrar
        previsões dentro do site. Eles <b>não têm valor monetário</b>, não
        podem ser comprados, vendidos, trocados por dinheiro ou qualquer bem,
        nem sacados — em nenhuma hipótese e em nenhuma direção. O DitoFeito
        não processa pagamentos e não tem gateway de pagamento na sua
        arquitetura.
      </p>

      <h3>Mercados eleitorais</h3>
      <p>
        Mercados sobre eleições exibem um aviso específico: o DitoFeito
        agrega a opinião de quem participa, não é pesquisa eleitoral
        registrada (Lei 9.504/97), e não vende destaque a pré-candidato ou
        campanha.
      </p>

      <h3>Uma conta por pessoa</h3>
      <p>
        Cada pessoa pode ter só uma conta. Pedimos CPF no cadastro
        justamente pra reduzir a criação de contas duplicadas — validamos o
        formato e o dígito verificador do número (não confirmamos que você é
        o titular dele) e garantimos que o mesmo CPF não seja reusado em
        outro cadastro. Criar múltiplas contas, coordenar contas com
        terceiros pra manipular o preço de um mercado, ou tentar burlar essa
        checagem são violações destes termos e podem levar à suspensão da
        conta.
      </p>

      <h3>Conduta</h3>
      <ul>
        <li>Comentários e previsões são públicos e ficam associados ao seu perfil.</li>
        <li>Não é permitido assédio, discurso de ódio, ou conteúdo ilegal nos comentários.</li>
        <li>Contas suspeitas de manipulação coordenada podem ser sinalizadas e revisadas manualmente antes de qualquer ação.</li>
        <li>Contas banidas perdem acesso ao site; pontos e posições não são reembolsados nem convertidos em nada.</li>
      </ul>

      <h3>Patrocínio</h3>
      <p>
        Alguns espaços do site (coluna lateral, faixa da home, cards
        nativos, página de mercado) podem exibir patrocínio identificado
        como tal ("Apresentado por" ou "Publicidade"). Anunciantes têm um
        painel próprio pra gerenciar logo, site e redes sociais do próprio
        anúncio, dentro do plano contratado.
      </p>

      <h3>Isenção de responsabilidade</h3>
      <p>
        O DitoFeito é oferecido "como está". Fazemos o possível pra manter o
        site no ar e os dados corretos, mas não garantimos disponibilidade
        contínua nem a exatidão de previsões de terceiros exibidas no site —
        são opinião agregada de participantes, não recomendação de nenhum
        tipo.
      </p>

      <h3>Alterações nestes termos</h3>
      <p>
        Podemos atualizar estes termos conforme o produto evolui. Mudanças
        relevantes serão refletidas na data no topo desta página.
      </p>

      <h2 id="privacidade">Política de privacidade</h2>

      <h3>Quem trata seus dados</h3>
      <p>
        HOSTGOV INOVA SIMPLES (I.S.), CNPJ 52.584.900/0001-27, é a
        controladora dos dados pessoais tratados pelo DitoFeito, nos termos
        da Lei 13.709/2018 (LGPD).
      </p>

      <h3>Quais dados coletamos e por quê</h3>
      <ul>
        <li><b>Nome de usuário, nome de exibição, e-mail e senha</b> (a senha nunca é armazenada em texto puro, só um hash) — pra criar e proteger sua conta.</li>
        <li><b>CPF</b> — só pra garantir que cada pessoa tenha uma única conta (ver "Uma conta por pessoa" acima). Validamos formato e dígito verificador; não consultamos nenhuma base de terceiros.</li>
        <li><b>IP e navegador no momento do cadastro</b> — usados internamente pra identificar padrões de criação de múltiplas contas a partir do mesmo lugar. Não é usado pra rastrear sua navegação.</li>
        <li><b>Cookie de sessão</b> (httpOnly, não acessível por JavaScript) — necessário pra manter você logado. Não usamos cookies de rastreamento ou publicidade de terceiros.</li>
        <li><b>Previsões, posições e comentários</b> — o conteúdo que você mesmo cria ao usar o site, público por natureza do produto.</li>
        <li><b>Dados de patrocinador</b> (pra contas de anunciante): nome, logo, site e redes sociais do próprio negócio — não são dados pessoais de pessoa física.</li>
      </ul>

      <h3>Com quem compartilhamos</h3>
      <p>
        Não vendemos nem alugamos seus dados. Usamos os seguintes
        prestadores de serviço, cada um só com o necessário pra função dele:
      </p>
      <ul>
        <li><b>Resend</b> — envio de e-mails transacionais (confirmação de cadastro, redefinição de senha). Recebe seu e-mail e o conteúdo da mensagem.</li>
        <li><b>Cloudflare</b> — verificação de que você é humano no cadastro (Turnstile) e armazenamento cifrado dos backups do banco de dados.</li>
      </ul>

      <h3>Por quanto tempo guardamos</h3>
      <p>
        Enquanto sua conta estiver ativa. Se você pedir a exclusão da conta,
        removemos os dados pessoais associados, exceto o que formos
        obrigados a manter por lei (ex.: registros fiscais) ou o necessário
        pra manter a integridade do histórico público de previsões já
        resolvidas (nesse caso, anonimizamos o vínculo com sua identidade
        sempre que possível).
      </p>

      <h3>Seus direitos</h3>
      <p>Como titular dos dados, você pode pedir a qualquer momento:</p>
      <ul>
        <li>Confirmação de que tratamos seus dados, e acesso a eles;</li>
        <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
        <li>Exclusão dos dados tratados com seu consentimento;</li>
        <li>Portabilidade dos dados a outro fornecedor;</li>
        <li>Informação sobre com quem compartilhamos seus dados;</li>
        <li>Revogação do consentimento, quando aplicável.</li>
      </ul>
      <p>
        Hoje esses pedidos são atendidos manualmente pelo e-mail abaixo — o
        site ainda não tem um botão de autoatendimento pra isso.
      </p>

      <h3>Fale com a gente</h3>
      <p>
        Dúvidas sobre estes termos ou pedidos relacionados aos seus dados:{" "}
        <a href="mailto:trilhascodo@gmail.com">trilhascodo@gmail.com</a>.
      </p>

      <h3>Alterações nesta política</h3>
      <p>
        Podemos atualizar esta política conforme o produto evolui. Mudanças
        relevantes serão refletidas na data no topo desta página.
      </p>

      <p style={{ marginTop: 40 }}>
        <Link to="/">Voltar ao DitoFeito</Link>
      </p>
    </main>
  );
}
