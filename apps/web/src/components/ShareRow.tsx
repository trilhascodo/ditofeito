import { useState } from "react";

// Componente único pros 4 lugares que compartilham algo (convite de grupo,
// card de vindicação de mercado/bolão, botão geral de mercado) — antes cada
// um colava a mesma linha de botões, isso virou duplicação real na 4ª cópia.
export type ShareChannel =
  | "WHATSAPP" | "TELEGRAM" | "FACEBOOK" | "X" | "LINKEDIN" | "PINTEREST"
  | "SNAPCHAT" | "INSTAGRAM" | "COPY_LINK" | "NATIVE";

export function ShareRow({
  url, text, imageUrl, onShare, label = "Compartilhar:",
}: {
  url: string;
  text: string;
  /** Pinterest exige uma imagem pra funcionar — sem isso o botão nem faz
   *  sentido de mostrar (comentado abaixo). */
  imageUrl?: string;
  /** Opcional — só os lugares com rastreamento (botão geral de mercado)
   *  passam isso; convite e cards de vindicação não têm tracking. */
  onShare?: (channel: ShareChannel) => void;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  function fire(channel: ShareChannel) {
    onShare?.(channel);
  }

  async function onCopy() {
    await navigator.clipboard.writeText(url);
    fire("COPY_LINK");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Instagram não tem intent web de compartilhamento pré-preenchido (nenhum
  // link abre o app já com texto/URL prontos) — o único caminho real a
  // partir do navegador é copiar o link pra colar no Story/bio/DM na mão.
  async function onInstagram() {
    await navigator.clipboard.writeText(url);
    fire("INSTAGRAM");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function onNative() {
    navigator.share?.({ title: text, url }).then(() => fire("NATIVE")).catch(() => {});
  }

  const btnStyle = { width: "auto", padding: "6px 12px" } as const;

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      {label && <span className="hint-text">{label}</span>}
      <a
        className="btn-outline" style={btnStyle}
        href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
        target="_blank" rel="noopener noreferrer" onClick={() => fire("WHATSAPP")}
      >
        WhatsApp
      </a>
      <a
        className="btn-outline" style={btnStyle}
        href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`}
        target="_blank" rel="noopener noreferrer" onClick={() => fire("TELEGRAM")}
      >
        Telegram
      </a>
      <a
        className="btn-outline" style={btnStyle}
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
        target="_blank" rel="noopener noreferrer" onClick={() => fire("FACEBOOK")}
      >
        Facebook
      </a>
      <a
        className="btn-outline" style={btnStyle}
        href={`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
        target="_blank" rel="noopener noreferrer" onClick={() => fire("X")}
      >
        X
      </a>
      <a
        className="btn-outline" style={btnStyle}
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
        target="_blank" rel="noopener noreferrer" onClick={() => fire("LINKEDIN")}
      >
        LinkedIn
      </a>
      {imageUrl && (
        <a
          className="btn-outline" style={btnStyle}
          href={`https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&description=${encodeURIComponent(text)}&media=${encodeURIComponent(imageUrl)}`}
          target="_blank" rel="noopener noreferrer" onClick={() => fire("PINTEREST")}
        >
          Pinterest
        </a>
      )}
      <a
        className="btn-outline" style={btnStyle}
        href={`https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(url)}`}
        target="_blank" rel="noopener noreferrer" onClick={() => fire("SNAPCHAT")}
      >
        Snapchat
      </a>
      <button
        type="button" className="btn-outline" style={btnStyle} onClick={onInstagram}
        title="Instagram não tem link pronto — copia o link pra colar no Story, bio ou DM"
      >
        {copied ? "Copiado!" : "Instagram"}
      </button>
      {typeof navigator !== "undefined" && !!navigator.share && (
        <button type="button" className="btn-outline" style={btnStyle} onClick={onNative}>
          Compartilhar…
        </button>
      )}
      <button type="button" className="btn-outline" style={btnStyle} onClick={onCopy}>
        {copied ? "Copiado!" : "Copiar link"}
      </button>
    </div>
  );
}
