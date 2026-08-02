import { useEffect, useId } from "react";

// Carrega o script só quando o Brick é montado (só a recarga por cartão do
// painel de sponsor precisa) — mesmo padrão de components/Turnstile.tsx.
const SCRIPT_SRC = "https://sdk.mercadopago.com/js/v2";

export interface CardBrickFormData {
  token: string;
  issuer_id?: string;
  payment_method_id: string;
  payment_method_option_id?: string;
  payer: { email: string; identification: { type: string; number: string } };
}

interface CardBrickController {
  unmount: () => void;
}

declare global {
  interface Window {
    MercadoPago?: new (
      publicKey: string, opts?: { locale?: string },
    ) => {
      bricks: () => {
        create: (brick: string, containerId: string, settings: unknown) => Promise<CardBrickController>;
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Falha ao carregar o Mercado Pago"));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

// O número de cartão, validade e CVV NUNCA passam pelo nosso código — o
// Brick renderiza um iframe hospedado pelo próprio Mercado Pago pros campos
// sensíveis e devolve só um token de uso único aqui em onSubmit.
export function MercadoPagoCardBrick({
  amountCents, payerEmail, payerTaxId, onToken, onError, onReady,
}: {
  amountCents: number;
  payerEmail: string;
  payerTaxId?: string;
  onToken: (data: CardBrickFormData) => Promise<void>;
  onError?: (message: string) => void;
  onReady?: () => void;
}) {
  const containerId = `mp-card-brick-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const publicKey = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY as string | undefined;

  useEffect(() => {
    if (!publicKey) return;
    let controller: CardBrickController | undefined;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !window.MercadoPago) return;
        const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
        return mp.bricks().create("cardPayment", containerId, {
          initialization: {
            amount: amountCents / 100,
            payer: payerTaxId
              ? { email: payerEmail, identification: { type: payerTaxId.length === 11 ? "CPF" : "CNPJ", number: payerTaxId } }
              : { email: payerEmail },
          },
          // Trava parcelamento em 1x nos dois lados — o backend também
          // ignora installments vindo do cliente e sempre cobra à vista
          // (ver lib/mercadoPago.ts::createCardPayment).
          customization: { paymentMethods: { minInstallments: 1, maxInstallments: 1 } },
          callbacks: {
            // onReady/onError são obrigatórios pro Brick — sem os dois ele
            // lança "Callbacks onReady and/or onError are required" e nem
            // inicializa.
            onReady: () => onReady?.(),
            onSubmit: (formData: CardBrickFormData) => onToken(formData),
            onError: (error: unknown) =>
              onError?.(error instanceof Error ? error.message : "Erro no formulário de cartão"),
          },
        });
      })
      .then((c) => { if (!cancelled) controller = c; })
      .catch((e) => onError?.(e instanceof Error ? e.message : "Erro ao carregar o formulário de cartão"));
    return () => {
      cancelled = true;
      controller?.unmount();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, amountCents, payerEmail, payerTaxId]);

  if (!publicKey) return null;
  return <div id={containerId} />;
}
