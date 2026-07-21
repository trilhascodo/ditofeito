// Sugestão de UF a partir da geolocalização do navegador (opt-in, permissão
// do próprio usuário) — sem geo-IP, sem API de terceiro, mesma filosofia de
// 019_region_segmentation.sql. Aproxima por distância até a capital mais
// próxima: não é fronteira estadual real, mas não precisa ser — é só
// sugestão pra pré-preencher o campo, o usuário sempre confirma ou corrige
// antes de salvar (ver useUfGeolocation.ts).
const UF_CAPITALS: { uf: string; lat: number; lng: number }[] = [
  { uf: "AC", lat: -9.97, lng: -67.81 }, { uf: "AL", lat: -9.65, lng: -35.71 },
  { uf: "AP", lat: 0.03, lng: -51.07 }, { uf: "AM", lat: -3.10, lng: -60.02 },
  { uf: "BA", lat: -12.97, lng: -38.51 }, { uf: "CE", lat: -3.73, lng: -38.52 },
  { uf: "DF", lat: -15.79, lng: -47.88 }, { uf: "ES", lat: -20.32, lng: -40.34 },
  { uf: "GO", lat: -16.68, lng: -49.25 }, { uf: "MA", lat: -2.53, lng: -44.30 },
  { uf: "MT", lat: -15.60, lng: -56.10 }, { uf: "MS", lat: -20.44, lng: -54.65 },
  { uf: "MG", lat: -19.92, lng: -43.94 }, { uf: "PA", lat: -1.46, lng: -48.50 },
  { uf: "PB", lat: -7.12, lng: -34.88 }, { uf: "PR", lat: -25.43, lng: -49.27 },
  { uf: "PE", lat: -8.05, lng: -34.90 }, { uf: "PI", lat: -5.09, lng: -42.80 },
  { uf: "RJ", lat: -22.91, lng: -43.17 }, { uf: "RN", lat: -5.79, lng: -35.21 },
  { uf: "RS", lat: -30.03, lng: -51.23 }, { uf: "RO", lat: -8.76, lng: -63.90 },
  { uf: "RR", lat: 2.82, lng: -60.67 }, { uf: "SC", lat: -27.60, lng: -48.55 },
  { uf: "SP", lat: -23.55, lng: -46.63 }, { uf: "SE", lat: -10.91, lng: -37.07 },
  { uf: "TO", lat: -10.25, lng: -48.32 },
];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function nearestUf(lat: number, lng: number): string {
  let best = UF_CAPITALS[0];
  let bestDist = Infinity;
  for (const c of UF_CAPITALS) {
    const d = haversineKm(lat, lng, c.lat, c.lng);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best.uf;
}
