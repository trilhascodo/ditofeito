import { useState } from "react";
import { nearestUf } from "./geoUf";

type Status = "idle" | "locating" | "error";

// Botão "usar minha localização": pede permissão do navegador (opt-in,
// nunca automático) e sugere a UF mais próxima. Usuário sempre pode ignorar
// ou trocar depois — isso só pré-preenche o select existente.
export function useUfGeolocation() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  function locate(onUf: (uf: string) => void) {
    if (!("geolocation" in navigator)) {
      setError("Seu navegador não suporta geolocalização.");
      setStatus("error");
      return;
    }
    setStatus("locating");
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onUf(nearestUf(pos.coords.latitude, pos.coords.longitude));
        setStatus("idle");
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Permissão de localização negada."
            : "Não foi possível obter sua localização."
        );
        setStatus("error");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 }
    );
  }

  return { locate, status, error };
}

// Versão silenciosa, sem estado de UI: usada a cada previsão quando o
// usuário já ligou o opt-in no Perfil (permissão já concedida naquele
// momento, então isso normalmente resolve sem novo prompt do navegador).
// Qualquer falha vira null — nunca deve travar o registro da previsão.
export function getCurrentUf(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(nearestUf(pos.coords.latitude, pos.coords.longitude)),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 5 * 60 * 1000 },
    );
  });
}
