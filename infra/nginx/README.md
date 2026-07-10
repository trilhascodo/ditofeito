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

## Domínio interino (nip.io) — histórico

`ditofeito.com.br` (domínio do plano original) ainda não apontava para esta
VPS no momento do primeiro deploy (resolvia para IPs de parking do
registro.br). Para validar o deploy com HTTPS real sem esperar a propagação
de DNS, usamos o mesmo truque já aplicado no `smartlicenca` deste servidor:
um domínio `nip.io`, que resolve automaticamente para o IP contido no
próprio nome — sem precisar configurar DNS nenhum.

```
ditofeito.147-79-106-18.nip.io  ->  147.79.106.18
```

Mantido como fallback no `server_name` (útil pra depurar sem depender de
DNS), mesmo depois do domínio definitivo entrar.

## Domínio definitivo: ditofeito.com

O domínio efetivamente registrado foi **`ditofeito.com`** (sem `.br` — o
plano original em `README.md` §7 previa `.com.br`, mas foi o `.com` que
ficou disponível/escolhido na hora do registro). DNS apontado pelo usuário
em 10/jul/2026 (`A @ 147.79.106.18`, `A www 147.79.106.18`).

## Comandos rodados na VPS (histórico, para repetir/auditar)

```bash
cp infra/nginx/ditofeito.conf /etc/nginx/sites-available/ditofeito
ln -s /etc/nginx/sites-available/ditofeito /etc/nginx/sites-enabled/ditofeito
nginx -t && systemctl reload nginx

# Primeiro emitido só pro nip.io (antes do DNS apontar):
certbot --nginx -d ditofeito.147-79-106-18.nip.io \
  --non-interactive --agree-tos -m trilhascodo@gmail.com --redirect

# Depois que o DNS de ditofeito.com apontou pra VPS, mesmo certificado
# ampliado pro domínio real (SAN adicional, mesmo arquivo):
certbot --nginx -d ditofeito.com -d www.ditofeito.com \
  --cert-name ditofeito.147-79-106-18.nip.io \
  --non-interactive --agree-tos -m trilhascodo@gmail.com --redirect
```

O certbot reescreve `/etc/nginx/sites-available/ditofeito` para adicionar o
`server{}` de 443/ssl e o redirect 80→443 (mesmo padrão dos outros configs
em `/etc/nginx/sites-enabled/` desta VPS). `WEB_ORIGIN`/`APP_BASE_URL`/
`EMAIL_FROM` em `infra/.env` já apontam para `https://ditofeito.com`
(cookies/CORS/links de e-mail usam o domínio real).
