const RELATIVE_LONG = new Intl.RelativeTimeFormat("pt-BR", { numeric: "always" });
const RELATIVE_SHORT = new Intl.RelativeTimeFormat("pt-BR", { numeric: "always", style: "short" });

export function relativeClose(closeAt: string | Date): string {
  const diff = new Date(closeAt).getTime() - Date.now();
  if (diff <= 0) return "encerrado";
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) return `encerra ${RELATIVE_LONG.format(days, "day")}`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return `encerra ${RELATIVE_SHORT.format(hours, "hour")}`;
  const mins = Math.max(1, Math.floor(diff / 60_000));
  return `encerra ${RELATIVE_SHORT.format(mins, "minute")}`;
}

export const fmtPoints = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export const pct = (p: number) => `${(p * 100).toFixed(p >= 0.1 ? 0 : 1)}%`;

export function dataFmt(d: Date | string): string {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
