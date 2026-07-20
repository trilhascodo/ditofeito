# Kit de outreach — blogs políticos regionais (template por estado)

Objetivo: colocar o widget "Termômetro DitoFeito" em 3–5 blogs políticos de um estado por leva, com exclusividade de 30 dias *naquele estado* como moeda de troca. O DitoFeito é nacional — este kit é reutilizável a cada UF que entra em rotação; só troca `[UF]`/`[ESTADO]` e a lista de blogs-alvo.

Regra de ouro do contato: **não pedir reunião, mostrar a coisa pronta.** O link de demonstração faz o trabalho de venda. Mensagem curta, uma pergunta só, resposta fácil.

Antes de disparar, preparar por estado:
1. Uma página de demonstração pública do widget já com mercados reais daquela UF (governador, senado, convenções locais), abrindo bem no celular — blogueiro vai abrir no WhatsApp.
2. O snippet de embed testado no WordPress (a maioria desses blogs roda WP).
3. UTM por blog: `?utm_source=blog&utm_medium=embed&utm_campaign=nomedoblog`.
4. A lista de 3–5 blogs políticos prioritários do `[ESTADO]` — levantar antes de cada leva, não reaproveitar lista de outro estado.

---

## Mensagem 1 — WhatsApp (primeiro contato)

> Olá, [nome]! Sou Dimi Cunha, criador do **DitoFeito**, um termômetro que mostra, em tempo real, a probabilidade que o público informado atribui aos eventos da eleição em `[ESTADO]` — começando pelas convenções que abrem agora: quem confirma, quem registra no prazo.
>
> Montei um widget que se atualiza sozinho e pode rodar dentro do [nome do blog], de graça: [link da demo]
>
> Estou oferecendo exclusividade de 30 dias para os primeiros blogs de `[ESTADO]`. Quer que eu te mande o código pronto pra colar? Instala em 2 minutos.

Notas de uso:
- Personalizar a primeira linha com algo específico do blog quando possível ("vi sua cobertura da articulação do bloco X…") — uma frase, não um parágrafo.
- Só mencione vínculo pessoal com o estado (ex.: "sou de lá", cidade natal) quando for verdade — não reaproveitar a mesma alegação de origem em leva de outro estado.
- Se não responder em 48–72h, um único follow-up curto: "Consegui ver o widget rodando em outro blog daqui, te mando o print? A exclusividade em `[ESTADO]` ainda está de pé até [data]." Depois disso, parar — o custo de insistir é maior que o do silêncio.

## Mensagem 2 — resposta positiva (enviar o embed)

> Ótimo! É só colar este bloco onde quiser exibir (barra lateral funciona bem):
>
> ```html
> <iframe
>   src="https://ditofeito.com.br/embed/termometro?destaque=convencao&utm_source=blog&utm_medium=embed&utm_campaign=NOMEDOBLOG"
>   width="100%" height="420" frameborder="0"
>   title="Termômetro DitoFeito — [ESTADO] 2026"
>   loading="lazy"></iframe>
> ```
>
> Ele se atualiza sozinho a cada palpite — vocês não precisam mexer em nada. Dois pedidos só: manter o crédito "DitoFeito" que já vem no rodapé do widget, e, ao citar os números em matéria, usar "o mercado precifica X%" (não é pesquisa eleitoral — a metodologia completa está em ditofeito.com.br/metodologia).
>
> Qualquer coisa, me chama direto aqui. E se resolver publicar uma nota sobre a novidade, te mando um texto-base e imagens na hora.

## Versão e-mail (para quem prefere formalidade)

**Assunto:** Widget exclusivo para o [nome do blog] — termômetro das convenções 2026

> [Nome],
>
> sou Dimi Cunha, criador do DitoFeito. Acabo de lançar a plataforma — nacional, mercados abertos em cada estado — onde o público registra palpites sobre eventos verificáveis da eleição, e o conjunto vira uma probabilidade atualizada em tempo real. A janela de convenções que abre agora em `[ESTADO]` é o primeiro teste público por aí: quais nomes se confirmam, quais chapas registram no prazo do TSE.
>
> Preparei um widget gratuito que roda dentro do blog e se atualiza sozinho — conteúdo dinâmico novo todos os dias, sem trabalho para a redação. Demonstração ao vivo: [link]
>
> Estou oferecendo exclusividade de 30 dias aos primeiros veículos de `[ESTADO]`. A instalação é um bloco de código, dois minutos. Importante: não se trata de pesquisa eleitoral — não medimos intenção de voto — e a metodologia completa é pública em ditofeito.com.br/metodologia, o que dá segurança ao blog ao citar os números.
>
> Se tiver interesse, respondo com o código pronto hoje mesmo.
>
> Abraço,
> Dimi Cunha
> [WhatsApp] · ditofeito.com.br · linkedin.com/in/idenilsonscunha

---

## Objeções prováveis e respostas

**"Isso não dá problema com a Justiça Eleitoral?"**
Não é pesquisa (sem amostra, sem entrevista, sem intenção de voto) nem aposta (sem dinheiro em nenhuma ponta). A página de metodologia diz isso com base legal, e o widget nunca usa vocabulário de pesquisa. O blog cita como cita cotação de mercado: "o DitoFeito precifica X%".

**"Quanto custa depois dos 30 dias?"**
Continua gratuito — os 30 dias são de *exclusividade* (nenhum concorrente direto terá o widget nesse período em `[ESTADO]`), não de gratuidade. Isso cria urgência sem criar dívida futura.

**"E se o número estiver 'errado' / favorecer alguém?"**
O número não é nosso: é o agregado dos participantes, com mecanismo que encarece manipulação (LMSR) e política pública de suspensão editorial quando há indício de informação privilegiada. Errar faz parte — e cada mercado resolvido publica o confronto previsão × realidade, o que nenhuma pesquisa faz em dias.

**"Posso escolher quais mercados aparecem?"**
Sim — o embed aceita filtro por categoria (convenção, registro) e, se fizer sentido, monto uma seleção fixa para o blog, incluindo só os mercados de `[ESTADO]`. Só não removo o crédito nem altero os números.

---

## Sequência da leva (por estado)

| Dia | Ação |
|---|---|
| D0 | Demo do widget no ar com mercados de `[ESTADO]` + este kit preenchido com links reais |
| D1 | Disparo para os 5 blogs prioritários de `[ESTADO]` (WhatsApp; e-mail só se não houver WhatsApp público) |
| D2–D3 | Instalar nos que responderem; print de cada instalação vira post no X/LinkedIn ("o Termômetro já roda no blog X") |
| D3–D4 | Follow-up único nos silenciosos |
| D5 | Avaliar: com 2+ embeds ativos, abrir segunda leva dentro do mesmo estado (blogs regionais do interior) ou iniciar a leva do próximo estado da fila; com zero, revisar a demo antes de insistir |

## Fila de estados

Priorizar por calendário de convenções/registro no TSE de cada UF e por onde já existem mercados abertos no DitoFeito. Manter aqui o histórico de levas já disparadas (estado, data D0, resultado) para não repetir contato nem reciclar a mesma alegação de exclusividade em duas praças ao mesmo tempo sem necessidade.
