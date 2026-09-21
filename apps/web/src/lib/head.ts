// ============================================================================
// head.ts — <head> por rota no SPA (título, description, canonical, og:*,
// twitter:* e JSON-LD).
//
// Por que existe: o index.html traz canonical/og fixos apontando pra home, e
// o SPA nunca atualizava — na prática dizia ao buscador que os ~55 mercados
// "são" a home, e nenhum aparecia na busca. O crawler de rede social não
// passa por aqui (o nginx desvia pra /share/:slug, ver http/embed.ts); isto
// é pro Google/Bing, que executam o JavaScript da página.
// ============================================================================
import { useEffect } from "react";

const ORIGIN = typeof window !== "undefined" ? window.location.origin : "https://ditofeito.com";
const DEFAULT_TITLE = "DitoFeito — pode escrever";
const DEFAULT_DESC = "Mercado de previsão por reputação. Registre sua previsão sobre eleições, esportes e cultura — pontos e reputação, não dinheiro.";
const DEFAULT_IMAGE = `${ORIGIN}/card/home.png`;
const JSONLD_ID = "ld-rota";

function setMeta(selector: string, attr: "content" | "href", value: string) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

export interface PageMeta {
  title?: string;
  description?: string;
  /** caminho interno ("/m/abc"); o padrão é a rota atual */
  path?: string;
  image?: string;
  /** noindex pra página sem valor de busca (404, telas de conta) */
  noindex?: boolean;
  /** schema.org — vira <script type="application/ld+json"> */
  jsonLd?: Record<string, unknown>;
}

/** Atualiza o <head> enquanto a página estiver montada e devolve tudo ao
 *  padrão ao sair (o SPA não recarrega o index.html entre rotas). */
export function usePageMeta(meta: PageMeta): void {
  const { title, description, path, image, noindex, jsonLd } = meta;
  const ld = jsonLd ? JSON.stringify(jsonLd) : "";
  useEffect(() => {
    const url = `${ORIGIN}${path ?? window.location.pathname}`;
    const t = title ? `${title} — DitoFeito` : DEFAULT_TITLE;
    const d = description ?? DEFAULT_DESC;
    const img = image ?? DEFAULT_IMAGE;

    document.title = t;
    setMeta('link[rel="canonical"]', "href", url);
    setMeta('meta[name="description"]', "content", d);
    setMeta('meta[property="og:title"]', "content", t);
    setMeta('meta[property="og:description"]', "content", d);
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[property="og:image"]', "content", img);
    setMeta('meta[name="twitter:description"]', "content", d);
    setMeta('meta[name="twitter:image"]', "content", img);

    let robots = document.head.querySelector('meta[name="robots"]');
    if (noindex) {
      if (!robots) {
        robots = document.createElement("meta");
        robots.setAttribute("name", "robots");
        document.head.appendChild(robots);
      }
      robots.setAttribute("content", "noindex");
    } else robots?.remove();

    document.getElementById(JSONLD_ID)?.remove();
    if (ld) {
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.id = JSONLD_ID;
      s.textContent = ld;
      document.head.appendChild(s);
    }

    return () => {
      document.title = DEFAULT_TITLE;
      setMeta('link[rel="canonical"]', "href", `${ORIGIN}/`);
      setMeta('meta[name="description"]', "content", DEFAULT_DESC);
      setMeta('meta[property="og:title"]', "content", DEFAULT_TITLE);
      setMeta('meta[property="og:description"]', "content", DEFAULT_DESC);
      setMeta('meta[property="og:url"]', "content", `${ORIGIN}/`);
      setMeta('meta[property="og:image"]', "content", DEFAULT_IMAGE);
      setMeta('meta[name="twitter:description"]', "content", DEFAULT_DESC);
      setMeta('meta[name="twitter:image"]', "content", DEFAULT_IMAGE);
      document.head.querySelector('meta[name="robots"]')?.remove();
      document.getElementById(JSONLD_ID)?.remove();
    };
  }, [title, description, path, image, noindex, ld]);
}
