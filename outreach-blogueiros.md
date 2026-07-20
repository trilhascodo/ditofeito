# Outreach — blogs políticos do Maranhão

Canal de distribuição assimétrico nº1 do plano de lançamento: o widget
"Termômetro DitoFeito" (`/embed/termometro`, `apps/api/src/http/termometro.ts`)
embutido nos blogs que a audiência-alvo já lê todo dia. O blog ganha conteúdo
dinâmico de graça; nós ganhamos tráfego qualificado + citação.

Alvo inicial: 3–5 primeiros blogs que aderirem — Marco D'Eça, Neto Ferreira,
Jorge Aragão, Diego Emir, Gilberto Léda e equivalentes.

## O snippet (já pronto pra colar)

```html
<iframe
  src="https://ditofeito.com/embed/termometro?categoria=eleicoes-2026&destaque=SLUG-DO-CANDIDATO-LOCAL&utm_source=blog&utm_medium=embed&utm_campaign=NOME-DO-BLOG"
  width="420" height="320" style="border:0" loading="lazy"
  title="Termômetro DitoFeito"
></iframe>
```

Antes de mandar pra cada blog, substitua:
- `SLUG-DO-CANDIDATO-LOCAL` — o mercado do candidato que aquele blog cobre
  (destaque fixo no topo do widget, os outros mercados da categoria vêm
  logo abaixo).
- `NOME-DO-BLOG` — identificador curto (`marcodeca`, `netoferreira` etc.) pra
  separar origem de tráfego no relatório de UTM.

## Mensagem de WhatsApp (D0)

> Oi [nome], tudo bem? Sou [seu nome], do DitoFeito — um termômetro de
> probabilidade pras eleições 2026 no Maranhão (não é pesquisa registrada,
> é agregado de palpite com reputação, tipo Polymarket só que sem dinheiro
> envolvido).
>
> Montei um widget que atualiza sozinho e mostra a chance de cada
> pré-candidato — queria te oferecer de graça e com exclusividade por 30
> dias pro [nome do blog]. Já deixei funcionando aqui, com o [candidato
> local] em destaque: [link de demonstração]
>
> Se fizer sentido, é só colar um `<iframe>` — 2 minutos. Quer que eu mande
> o código já pronto pro seu site?

## E-mail (alternativa/D0, se preferir e-mail a WhatsApp)

**Assunto:** Termômetro DitoFeito — widget exclusivo pro [nome do blog] (30 dias)

> [nome],
>
> O DitoFeito é um mercado de previsão por reputação para as eleições 2026
> no Maranhão — cada pré-candidato tem uma probabilidade implícita que se
> move em tempo real conforme as pessoas registram palpite. Não é pesquisa
> eleitoral (Lei 9.504/97), não é aposta — pontos não têm valor monetário.
>
> Preparei um widget ("Termômetro") com o [candidato local] em destaque,
> pronto pra embutir no [nome do blog]. Demonstração ao vivo aqui: [link]
>
> Ofereço exclusividade de 30 dias pros primeiros blogs que aderirem — sem
> custo. Depois desse período o widget continua no ar, sem mudança nenhuma
> pra quem já tiver.
>
> Código de embed (uma linha, sem dependência externa) em anexo/abaixo.
> Qualquer dúvida, respondo rápido.
>
> [nome], DitoFeito — contato@ditofeito.com.br

## Objeções prováveis + resposta

**"Isso é pesquisa eleitoral disfarçada?"**
Não — pesquisa eleitoral entrevista amostra representativa e precisa de
registro no TSE (Lei 9.504/97, art. 33). O DitoFeito agrega palpite de quem
participa por vontade própria, sem pretensão de amostra representativa —
por isso o widget e todo card compartilhável levam o aviso "agregado de
opiniões de participantes, não é pesquisa eleitoral" quando o mercado é
eleitoral. Detalhe completo: `ditofeito.com/metodologia`.

**"É aposta? Tenho medo de vincular meu nome a apostas."**
Não circula dinheiro — os pontos não têm valor monetário, não podem ser
comprados, vendidos, trocados ou sacados. Mais perto de reputação/ranking
público do que de casa de aposta.

**"Vai me custar alguma coisa depois?"**
Os 30 dias são de **exclusividade** (só aquele blog tem o widget na região
por esse período) — não de cobrança futura. O widget em si é gratuito.

**"Preciso de aprovação técnica/do editor antes."**
Sem problema — o link de demonstração já está no ar, funciona igual ao que
ficaria no seu site. Manda pra quem precisar aprovar, sem compromisso.

## Sequência D0–D5

- **D0** — primeira mensagem (WhatsApp ou e-mail), link de demonstração já
  funcionando com o candidato local em destaque.
- **D2** — se sem resposta, follow-up curto: "Rodou tudo? Qualquer ajuste
  no widget eu faço na hora."
- **D5** — último toque: oferece ajuda pra instalar direto ("posso mandar
  print de onde colar no seu CMS") — depois disso, passa pro próximo da
  lista sem insistir mais.

## Depois que aderir

Confirmar visualmente que o iframe carregou (`view-source` ou inspecionar
elemento no site do blog) e que o UTM do blog aparece nos logs/analytics —
é o sinal de que a alavanca está puxando tráfego de verdade, não só "no ar".
