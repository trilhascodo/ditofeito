# Nginx nesta VPS (deploy compartilhado)

Achado no reconhecimento antes do primeiro deploy (10/jul/2026): a VPS de
produção (147.79.106.18) já roda **nginx nativo** nas portas 80/443 na frente
de vários outros apps (CarToken, SGD Educação, SmartPresença, SmartLicença),
com certbot gerenciando os certificados por domínio. Não existe Caddy — o
`infra/Caddyfile` deste repo é só para um cenário futuro de VPS dedicada.

## Decisões forçadas pelo ambiente compartilhado

- **`docker-compose.yml` não sobe proxy/TLS.** O nginx do host é a porta de
  entrada; o container `api` só escuta em `127.0.0.1:${API_HOST_PORT}`.
- **Postgres do DitoFeito não expõe porta nenhuma pro host** — só existe na
  rede interna do compose (`postgres:5432`). A VPS já tem um Postgres nativo
  na 5432; não tocamos nele.
- **`API_HOST_PORT=3200`** escolhido em `infra/.env` (portas 3000, 3001, 3002,
  3003 e 3100 já estavam em uso por outros apps via PM2 no momento do deploy —
  conferir `ss -tlnp` antes de reusar/mudar).
- **UFW está inativo nesta VPS.** Qualquer `ports:` publicada sem prefixo
  `127.0.0.1:` fica exposta direto na internet. Sempre publicar com
  `127.0.0.1:`.

## Domínio interino (nip.io)

`ditofeito.com.br` ainda não apontava para esta VPS no momento do primeiro
deploy (resolvia para IPs de parking do registro.br). Para validar o deploy
com HTTPS real sem esperar a propagação de DNS, usamos o mesmo truque já
aplicado no `smartlicenca` deste servidor: um domínio `nip.io`, que resolve
automaticamente para o IP contido no próprio nome — sem precisar configurar
DNS nenhum.

```
ditofeito.147-79-106-18.nip.io  ->  147.79.106.18
```

## Comandos rodados na VPS (histórico, para repetir/auditar)

```bash
cp infra/nginx/ditofeito.conf /etc/nginx/sites-available/ditofeito
ln -s /etc/nginx/sites-available/ditofeito /etc/nginx/sites-enabled/ditofeito
nginx -t && systemctl reload nginx

certbot --nginx -d ditofeito.147-79-106-18.nip.io \
  --non-interactive --agree-tos -m trilhascodo@gmail.com --redirect
```

O certbot reescreve `/etc/nginx/sites-available/ditofeito` para adicionar o
`server{}` de 443/ssl e o redirect 80→443 (mesmo padrão dos outros configs
em `/etc/nginx/sites-enabled/` desta VPS).

## Domínio definitivo (quando o DNS apontar)

Depois que `ditofeito.com.br` resolver para `147.79.106.18` (A record `@` e
`www` → `147.79.106.18`, ver instruções dadas ao usuário):

```bash
certbot --nginx -d ditofeito.com.br -d www.ditofeito.com.br \
  --non-interactive --agree-tos -m trilhascodo@gmail.com --redirect
```

Isso adiciona mais um `server{}` ao mesmo arquivo (ou um novo, se preferir
separar) — não precisa remover o bloco nip.io, mas dá pra limpar depois que o
domínio real estiver estável. Atualizar `WEB_ORIGIN`/`APP_BASE_URL` em
`infra/.env` para `https://ditofeito.com.br` nesse momento e reiniciar a API
(`docker compose -f infra/docker-compose.yml --env-file infra/.env up -d`)
para os cookies/CORS/links de e-mail passarem a usar o domínio real.
