/** SVG path de uma série [t(0..1), preço(0..1)] dentro de uma viewBox w×h. */
export function pathFromSeries(points: [number, number][], w: number, h: number, pad: number): string {
  if (points.length < 2) return "";
  return points
    .map(([t, p], i) => `${i ? "L" : "M"}${(pad + t * (w - 2 * pad)).toFixed(1)},${(h - p * h * 0.92 - pad).toFixed(1)}`)
    .join(" ");
}
