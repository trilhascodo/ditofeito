// Service worker mínimo — só existe pra satisfazer o critério de
// instalabilidade do Chrome/Android (precisa de um listener de fetch
// registrado). Sem estratégia de cache de propósito: preços de mercado
// mudam ao vivo, servir uma versão antiga da página seria enganoso.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
