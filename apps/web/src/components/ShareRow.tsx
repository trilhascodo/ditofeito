import { useState } from "react";
import { ICON_PATHS as BRAND_ICON_PATHS } from "../lib/socialIcons";

// Componente único pros 4 lugares que compartilham algo (convite de grupo,
// card de vindicação de mercado/bolão, botão geral de mercado) — antes cada
// um colava a mesma linha de botões, isso virou duplicação real na 4ª cópia.
export type ShareChannel =
  | "WHATSAPP" | "TELEGRAM" | "FACEBOOK" | "X" | "LINKEDIN" | "PINTEREST"
  | "SNAPCHAT" | "INSTAGRAM" | "COPY_LINK" | "NATIVE";

// Ícone é mais compacto que texto — maioria do tráfego é celular, onde 10
// botões de texto quebravam em várias linhas. Reaproveita os 4 glifos que já
// existem em socialIcons.tsx (mesmo princípio: monocromático, não logo
// colorido de marca) e desenha os que faltam no mesmo estilo (viewBox 16x16,
// stroke fino, poucos comandos de path).
const ICON_PATHS: Record<ShareChannel, string> = {
  WHATSAPP: BRAND_ICON_PATHS.WHATSAPP,
  INSTAGRAM: BRAND_ICON_PATHS.INSTAGRAM,
  X: BRAND_ICON_PATHS.X,
  FACEBOOK: BRAND_ICON_PATHS.FACEBOOK,
  TELEGRAM: "M2.3 8.4 13 3.2 10.6 13 7.3 9.7 5 11.2 4.7 8.9Z M7.3 9.7 10.4 5.3",
  LINKEDIN: "M4 6.2v5.3M4 3.6h.01M7.3 11.5V7.8M7.3 7.8a1.8 1.8 0 0 1 3.5 0v3.7M7.3 7.8v.01",
  PINTEREST: "M8 2a4 4 0 0 0-4 4c0 3.2 4 8 4 8s4-4.8 4-8a4 4 0 0 0-4-4Zm0 5.5A1.5 1.5 0 1 1 8 4a1.5 1.5 0 0 1 0 3.5Z",
  SNAPCHAT: "M4.5 12.5V7a3.5 3.5 0 0 1 7 0v5.5l-1.2-1-1 1.3-1.3-1.3-1.3 1.3-1-1.3Z",
  COPY_LINK: "M6.2 9.8 4.8 11.2a1.8 1.8 0 0 1-2.5-2.5l1.7-1.7a1.8 1.8 0 0 1 2.5 0M9.8 6.2l1.4-1.4a1.8 1.8 0 0 1 2.5 2.5l-1.7 1.7a1.8 1.8 0 0 1-2.5 0M6 10l4-4",
  NATIVE: "M8 2v7.5M5.3 4.7 8 2l2.7 2.7M3.5 8.5v3.7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V8.5",
};

const CHANNEL_LABEL: Record<ShareChannel, string> = {
  WHATSAPP: "WhatsApp", TELEGRAM: "Telegram", FACEBOOK: "Facebook", X: "X",
  LINKEDIN: "LinkedIn", PINTEREST: "Pinterest", SNAPCHAT: "Snapchat",
  INSTAGRAM: "Instagram — copia o link (cole no Story, bio ou DM)",
  COPY_LINK: "Copiar link", NATIVE: "Mais opções",
};

function ShareIcon({ channel }: { channel: ShareChannel }) {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor"
         strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[channel]} />
    </svg>
  );
}

export function ShareRow({
  url, text, imageUrl, onShare, label = "Compartilhar:",
}: {
  url: string;
  text: string;
  /** Pinterest exige uma imagem pra funcionar — sem isso o botão nem aparece. */
  imageUrl?: string;
  /** Opcional — só os lugares com rastreamento (botão geral de mercado)
   *  passam isso; convite e cards de vindicação não têm tracking. */
  onShare?: (channel: ShareChannel) => void;
  label?: string;
}) {
  const [copied, setCopied] = useState<ShareChannel | null>(null);

  function fire(channel: ShareChannel) {
    onShare?.(channel);
  }
  function flashCopied(channel: ShareChannel) {
    setCopied(channel);
    setTimeout(() => setCopied(null), 1500);
  }

  async function onCopy() {
    await navigator.clipboard.writeText(url);
    fire("COPY_LINK");
    flashCopied("COPY_LINK");
  }
  // Instagram não tem intent web de compartilhamento pré-preenchido (nenhum
  // link abre o app já com texto/URL prontos) — o único caminho real a
  // partir do navegador é copiar o link pra colar no Story/bio/DM na mão.
  async function onInstagram() {
    await navigator.clipboard.writeText(url);
    fire("INSTAGRAM");
    flashCopied("INSTAGRAM");
  }
  function onNative() {
    navigator.share?.({ title: text, url }).then(() => fire("NATIVE")).catch(() => {});
  }

  const links: { channel: ShareChannel; href: string }[] = [
    { channel: "WHATSAPP", href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
    { channel: "TELEGRAM", href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
    { channel: "FACEBOOK", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { channel: "X", href: `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
    { channel: "LINKEDIN", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    ...(imageUrl ? [{
      channel: "PINTEREST" as const,
      href: `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&description=${encodeURIComponent(text)}&media=${encodeURIComponent(imageUrl)}`,
    }] : []),
    { channel: "SNAPCHAT", href: `https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(url)}` },
  ];

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {label && <span className="hint-text">{label}</span>}
      {links.map(({ channel, href }) => (
        <a
          key={channel} className="social-link" href={href}
          target="_blank" rel="noopener noreferrer" aria-label={CHANNEL_LABEL[channel]}
          title={CHANNEL_LABEL[channel]} onClick={() => fire(channel)}
        >
          <ShareIcon channel={channel} />
        </a>
      ))}
      <button
        type="button" className="social-link" onClick={onInstagram}
        aria-label={CHANNEL_LABEL.INSTAGRAM} title={CHANNEL_LABEL.INSTAGRAM}
      >
        {copied === "INSTAGRAM" ? "✓" : <ShareIcon channel="INSTAGRAM" />}
      </button>
      {typeof navigator !== "undefined" && !!navigator.share && (
        <button
          type="button" className="social-link" onClick={onNative}
          aria-label={CHANNEL_LABEL.NATIVE} title={CHANNEL_LABEL.NATIVE}
        >
          <ShareIcon channel="NATIVE" />
        </button>
      )}
      <button
        type="button" className="social-link" onClick={onCopy}
        aria-label={CHANNEL_LABEL.COPY_LINK} title={CHANNEL_LABEL.COPY_LINK}
      >
        {copied === "COPY_LINK" ? "✓" : <ShareIcon channel="COPY_LINK" />}
      </button>
    </div>
  );
}
