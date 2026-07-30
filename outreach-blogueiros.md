# Kit de outreach — blogs políticos (template por estado)

Canal de distribuição assimétrico nº1 do plano de lançamento: o widget
"Termômetro DitoFeito" (`/embed/termometro`, `apps/api/src/http/termometro.ts`)
embutido nos blogs que a audiência-alvo já lê todo dia. O blog ganha conteúdo
dinâmico de graça; nós ganhamos tráfego qualificado + citação.

O DitoFeito é nacional — este kit é reutilizável a cada UF que entra em
rotação; só troca `[UF]`/`[ESTADO]` e a lista de blogs-alvo. Alvo por leva:
3–5 primeiros blogs políticos daquele estado que aderirem, com exclusividade
de 30 dias *naquela UF* como moeda de troca.

Regra de ouro do contato: **não pedir reunião, mostrar a coisa pronta.** O
link de demonstração faz o trabalho de venda. Mensagem curta, uma pergunta
só, resposta fácil.

Antes de disparar, preparar por estado:
1. Uma página de demonstração pública do widget já com mercados reais daquela
   UF (governador, senado, convenções locais), abrindo bem no celular —
   blogueiro vai abrir no WhatsApp.
2. O snippet de embed testado no WordPress (a maioria desses blogs roda WP).
3. A lista de 3–5 blogs políticos prioritários do `[ESTADO]` — levantar antes
   de cada leva, não reaproveitar lista de outro estado.

## O snippet (já pronto pra colar)

```html
<iframe
  src="https://ditofeito.com/embed/termometro?categoria=CATEGORIA-DA-UF&destaque=SLUG-DO-CANDIDATO-LOCAL&utm_source=blog&utm_medium=embed&utm_campaign=NOME-DO-BLOG"
  width="420" height="320" style="border:0" loading="lazy"
  title="Termômetro DitoFeito — [ESTADO] 2026"
></iframe>
```

Antes de mandar pra cada blog, substitua:
- `CATEGORIA-DA-UF` — slug da categoria de mercados daquele estado (ex.:
  `eleicoes-2026-ma`).
- `SLUG-DO-CANDIDATO-LOCAL` — o mercado do candidato que aquele blog cobre
  (destaque fixo no topo do widget, os outros mercados da categoria vêm logo
  abaixo).
- `NOME-DO-BLOG` — identificador curto (`marcodeca`, `netoferreira` etc.) pra
  separar origem de tráfego no relatório de UTM.

## Mensagem 1 — WhatsApp (primeiro contato, D0)

> Oi [nome], tudo bem? Sou [seu nome], do DitoFeito — um termômetro de
> probabilidade pras eleições 2026 em `[ESTADO]` (não é pesquisa registrada,
> é agregado de palpite com reputação, tipo Polymarket só que sem dinheiro
> envolvido) — começando pelas convenções que abrem agora: quem confirma,
> quem registra no prazo do TSE.
>
> Montei um widget que atualiza sozinho e mostra a chance de cada
> pré-candidato — queria te oferecer de graça e com exclusividade de 30 dias
> pro [nome do blog] em `[ESTADO]`. Já deixei funcionando aqui, com o
> [candidato local] em destaque: [link de demonstração]
>
> Se fizer sentido, é só colar um `<iframe>` — 2 minutos. Quer que eu mande o
> código já pronto pro seu site?

Notas de uso:
- Personalizar a primeira linha com algo específico do blog quando possível
  ("vi sua cobertura da articulação do bloco X…") — uma frase, não um
  parágrafo.
- Só mencione vínculo pessoal com o estado (ex.: "sou de lá", cidade natal)
  quando for verdade — não reaproveitar a mesma alegação de origem em leva de
  outro estado.
- Se não responder em 48–72h, um único follow-up curto: "Consegui ver o
  widget rodando em outro blog daqui, te mando o print? A exclusividade em
  `[ESTADO]` ainda está de pé até [data]." Depois disso, parar — o custo de
  insistir é maior que o do silêncio.

## Mensagem 2 — resposta positiva (enviar o embed)

> Ótimo! É só colar este bloco onde quiser exibir (barra lateral funciona
> bem):
>
> ```html
> <iframe
>   src="https://ditofeito.com/embed/termometro?categoria=CATEGORIA-DA-UF&destaque=SLUG-DO-CANDIDATO-LOCAL&utm_source=blog&utm_medium=embed&utm_campaign=NOME-DO-BLOG"
>   width="100%" height="420" frameborder="0"
>   title="Termômetro DitoFeito — [ESTADO] 2026"
>   loading="lazy"></iframe>
> ```
>
> Ele se atualiza sozinho a cada palpite — vocês não precisam mexer em nada.
> Dois pedidos só: manter o crédito "DitoFeito" que já vem no rodapé do
> widget, e, ao citar os números em matéria, usar "o mercado precifica X%"
> (não é pesquisa eleitoral — a metodologia completa está em
> `ditofeito.com/metodologia`).
>
> Qualquer coisa, me chama direto aqui. E se resolver publicar uma nota sobre
> a novidade, te mando um texto-base e imagens na hora.

## E-mail (alternativa/D0, se preferir e-mail a WhatsApp)

**Assunto:** Termômetro DitoFeito — widget exclusivo pro [nome do blog] (30 dias)

> [nome],
>
> O DitoFeito é um mercado de previsão por reputação para as eleições 2026 —
> nacional, mercados abertos em cada estado — onde o público registra
> palpites sobre eventos verificáveis, e o conjunto vira uma probabilidade
> atualizada em tempo real. A janela de convenções que abre agora em
> `[ESTADO]` é o primeiro teste público por aí: quais nomes se confirmam,
> quais chapas registram no prazo do TSE. Não é pesquisa eleitoral (Lei
> 9.504/97), não é aposta — pontos não têm valor monetário.
>
> Preparei um widget ("Termômetro") com o [candidato local] em destaque,
> pronto pra embutir no [nome do blog]. Demonstração ao vivo aqui: [link]
>
> Ofereço exclusividade de 30 dias aos primeiros veículos de `[ESTADO]` que
> aderirem — sem custo. Depois desse período o widget continua no ar, sem
> mudança nenhuma pra quem já tiver. A instalação é um bloco de código, dois
> minutos.
>
> A metodologia completa é pública em `ditofeito.com/metodologia`, o que dá
> segurança ao blog ao citar os números. Qualquer dúvida, respondo rápido.
>
> [seu nome], DitoFeito — contato@ditofeito.com

## Objeções prováveis e respostas

**"Isso não dá problema com a Justiça Eleitoral? / É pesquisa eleitoral disfarçada?"**
Não é pesquisa (sem amostra, sem entrevista, sem intenção de voto) nem
aposta (sem dinheiro em nenhuma ponta). Pesquisa eleitoral entrevista amostra
representativa e precisa de registro no TSE (Lei 9.504/97, art. 33); o
DitoFeito agrega palpite de quem participa por vontade própria, sem
pretensão de amostra representativa — por isso o widget e todo card
compartilhável levam o aviso "agregado de opiniões de participantes, não é
pesquisa eleitoral" quando o mercado é eleitoral. O blog cita como cita
cotação de mercado: "o DitoFeito precifica X%". Detalhe completo:
`ditofeito.com/metodologia`.

**"É aposta? Tenho medo de vincular meu nome a apostas."**
Não circula dinheiro — os pontos não têm valor monetário, não podem ser
comprados, vendidos, trocados ou sacados. Mais perto de reputação/ranking
público do que de casa de aposta.

**"Quanto custa depois dos 30 dias?"**
Continua gratuito — os 30 dias são de **exclusividade** (nenhum concorrente
direto terá o widget nesse período em `[ESTADO]`), não de gratuidade. Isso
cria urgência sem criar dívida futura.

**"E se o número estiver 'errado' / favorecer alguém?"**
O número não é nosso: é o agregado dos participantes, com mecanismo que
encarece manipulação (LMSR) e política pública de suspensão editorial quando
há indício de informação privilegiada. Errar faz parte — e cada mercado
resolvido publica o confronto previsão × realidade, o que nenhuma pesquisa
faz em dias.

**"Posso escolher quais mercados aparecem?"**
Sim — o embed aceita filtro por categoria (convenção, registro) e, se fizer
sentido, monto uma seleção fixa para o blog, incluindo só os mercados de
`[ESTADO]`. Só não removo o crédito nem altero os números.

**"Preciso de aprovação técnica/do editor antes."**
Sem problema — o link de demonstração já está no ar, funciona igual ao que
ficaria no seu site. Manda pra quem precisar aprovar, sem compromisso.

## Sequência da leva (por estado)

| Dia | Ação |
|---|---|
| D0 | Demo do widget no ar com mercados de `[ESTADO]` + este kit preenchido com links reais; primeira mensagem (WhatsApp ou e-mail) |
| D2–D3 | Instalar nos que responderem; print de cada instalação vira post no X/LinkedIn ("o Termômetro já roda no blog X") |
| D3–D4 | Follow-up único nos silenciosos ("Rodou tudo? Qualquer ajuste no widget eu faço na hora.") |
| D5 | Último toque nos que sumiram; avaliar: com 2+ embeds ativos, abrir segunda leva dentro do mesmo estado (blogs regionais do interior) ou iniciar a leva do próximo estado da fila; com zero, revisar a demo antes de insistir |

## Depois que aderir

Confirmar visualmente que o iframe carregou (`view-source` ou inspecionar
elemento no site do blog) e que o UTM do blog aparece nos logs/analytics —
é o sinal de que a alavanca está puxando tráfego de verdade, não só "no ar".

## Fila de estados

Priorizar por calendário de convenções/registro no TSE de cada UF e por onde
já existem mercados abertos no DitoFeito. Manter aqui o histórico de levas já
disparadas (estado, data D0, resultado) para não repetir contato nem
reciclar a mesma alegação de exclusividade em duas praças ao mesmo tempo sem
necessidade.

| Estado | D0 | Blogs contatados | Embeds ativos | Notas |
|---|---|---|---|---|
| MA | — | Marco D'Eça, Neto Ferreira, Jorge Aragão, Diego Emir, Gilberto Léda | — | leva original, kit em português MA-específico |
