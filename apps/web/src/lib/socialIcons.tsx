// Glifos monocromáticos simples, não logos coloridos de marca — mesmo
// princípio do CATEGORY_EMOJI em Home.tsx: "consistência de marca >
// variedade". currentColor deixa o CSS (.social-link) controlar a cor.
const ICON_PATHS: Record<string, string> = {
  INSTAGRAM: "M5 3h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm3.3-1.8h.01",
  X: "M3 3l10 10M13 3 3 13",
  TIKTOK: "M9 2v7.5a2.5 2.5 0 1 1-2-2.45V9.2a4.2 4.2 0 1 0 3.7 4.17V6.3a3.6 3.6 0 0 0 2.5 1V5.4A3.6 3.6 0 0 1 9 2Z",
  YOUTUBE: "M2.5 5.5A2 2 0 0 1 4.5 3.5h7a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-5ZM7 6.3v3.4l3-1.7-3-1.7Z",
  FACEBOOK: "M9.5 3h-1A2.5 2.5 0 0 0 6 5.5V7H4.5v2H6v4h2V9h1.6l.4-2H8V5.5c0-.3.2-.5.5-.5H9.5V3Z",
  WHATSAPP: "M8 2.5a5.5 5.5 0 0 0-4.8 8.2L2.5 13.5l2.9-.7A5.5 5.5 0 1 0 8 2.5Zm2.9 7.6c-.1.3-.7.6-1 .6-.3 0-.6.1-1.9-.5-1.6-.7-2.6-2.4-2.7-2.5-.1-.1-.6-.8-.6-1.6s.4-1.1.6-1.3c.1-.1.3-.2.5-.2h.3c.1 0 .3 0 .4.3l.5 1.3c0 .1.1.2 0 .3l-.3.4c-.1.1-.2.2-.1.4.2.3.7 1 1.4 1.5.5.4.9.5 1 .6.2.1.3.1.4-.1l.4-.5c.1-.2.3-.1.4-.1l1.2.6c.1.1.2.1.2.2.1.1.1.5 0 .8Z",
};

export const SOCIAL_PLATFORMS = ["INSTAGRAM", "X", "TIKTOK", "YOUTUBE", "FACEBOOK", "WHATSAPP"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_LABEL: Record<SocialPlatform, string> = {
  INSTAGRAM: "Instagram", X: "X (Twitter)", TIKTOK: "TikTok",
  YOUTUBE: "YouTube", FACEBOOK: "Facebook", WHATSAPP: "WhatsApp",
};

export interface SocialLinkItem { id: string; platform: SocialPlatform; url: string }

// sponsorshipId opcional: quando presente, o clique passa pelo redirect
// /ir/:sponsorshipId/social/:id (mesma métrica de ad_events do link
// principal — clique é clique, rede social não é canal à parte pro CTR).
// Sem sponsorshipId (não deveria acontecer nos 4 lugares que usam isso hoje,
// mas evita quebrar se algum uso futuro não tiver), cai no link direto.
export function SocialLinks({ items, sponsorshipId }: { items: SocialLinkItem[]; sponsorshipId?: string }) {
  if (items.length === 0) return null;
  return (
    <div className="social-links">
      {items.map((it) => (
        <a
          key={it.id} className="social-link"
          href={sponsorshipId ? `/ir/${sponsorshipId}/social/${it.id}` : it.url}
          target="_blank" rel="noopener noreferrer" aria-label={SOCIAL_LABEL[it.platform]}
        >
          <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor"
               strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={ICON_PATHS[it.platform]} />
          </svg>
        </a>
      ))}
    </div>
  );
}
