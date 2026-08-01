import { useState, type FormEvent } from "react";
import { formatCpf, isValidCpf, onlyDigits } from "@ditofeito/core";
import { trpc } from "../lib/trpc";

// Passo tardio de "1 conta por pessoa" (garante ranking/reputação
// confiáveis) — não faz parte do cadastro, aparece só quando o usuário
// esbarra em CPF_PENDENTE no primeiro palpite pago com pontos (ver
// domain/trade.ts na API). Reutilizado em MarketPage.tsx (inline, ao tentar
// negociar) e Profile.tsx (banner fixo).
export function CpfPrompt({ onDone }: { onDone: () => void }) {
  const [cpf, setCpf] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submitCpf = trpc.user.submitCpf.useMutation();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidCpf(cpf)) {
      setError("CPF inválido");
      return;
    }
    try {
      await submitCpf.mutateAsync({ cpf: onlyDigits(cpf) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao confirmar CPF");
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="hint-text" style={{ marginBottom: 10 }}>
        Confirme seu CPF pra continuar — garante 1 conta por pessoa (mantém o ranking honesto),
        nunca é público.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <input
          className="input" style={{ flex: "1 1 200px" }} inputMode="numeric"
          placeholder="000.000.000-00" required
          value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))}
        />
        <button className="btn-outline" style={{ width: "auto", padding: "10px 18px" }} disabled={submitCpf.isPending}>
          {submitCpf.isPending ? "Confirmando…" : "Confirmar"}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
