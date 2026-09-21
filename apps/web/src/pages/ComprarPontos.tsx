import { useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/useAuth";
import { MercadoPagoCardBrick, type CardBrickFormData } from "../components/MercadoPagoCardBrick";
import { usePageMeta } from "../lib/head";

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtBRL = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dtDisplay = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function ComprarPontos() {
  usePageMeta({ noindex: true });
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: me } = trpc.user.me.useQuery(undefined, { enabled: !!user });
  const { data: config } = trpc.points.purchaseConfig.useQuery(undefined, { enabled: !!user });
  const { data: pending } = trpc.points.myPendingPayments.useQuery(undefined, {
    enabled: !!user,
    // Enquanto tiver Pix/boleto em aberto, atualiza sozinho — quando o
    // webhook confirmar, a tela reflete sem precisar F5.
    refetchInterval: (query) => (query.state.data?.length ? 5_000 : false),
  });
  const createTopup = trpc.points.createTopup.useMutation();

  const [amount, setAmount] = useState("10");
  const [method, setMethod] = useState<"PIX" | "BOLETO" | "CARD">("PIX");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cardOk, setCardOk] = useState(false);
  const [lastResult, setLastResult] = useState<{ qrCode: string | null; qrCodeBase64: string | null; boletoUrl: string | null; points: number } | null>(null);

  const amountCents = Math.round(Number(amount.replace(",", ".")) * 100);
  const previewPoints = config ? amountCents * config.pointsPerCent : null;

  async function onTopup() {
    setErr(null);
    if (!config) return;
    if (amountCents < config.minTopupCents || amountCents > config.maxTopupCents) {
      setErr(`Valor entre ${fmtBRL(config.minTopupCents)} e ${fmtBRL(config.maxTopupCents)}`);
      return;
    }
    try {
      const r = await createTopup.mutateAsync({ amountCents, method: method as "PIX" | "BOLETO" });
      setLastResult(r);
      await utils.points.myPendingPayments.invalidate();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Erro ao gerar cobrança");
    }
  }

  async function onCardToken(formData: CardBrickFormData) {
    setErr(null); setCardOk(false);
    try {
      await createTopup.mutateAsync({
        method: "CARD", amountCents,
        token: formData.token, paymentMethodId: formData.payment_method_id,
        issuerId: formData.issuer_id, paymentMethodOptionId: formData.payment_method_option_id,
        payerEmail: formData.payer.email, payerTaxId: formData.payer.identification.number,
      });
      setCardOk(true);
      await Promise.all([utils.points.myPendingPayments.invalidate(), utils.user.me.invalidate()]);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Erro ao processar o cartão");
      throw error; // deixa o Brick também sinalizar erro no próprio formulário
    }
  }

  async function onCopyQr(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!user) {
    return (
      <main className="page-narrow">
        <div className="card">
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Comprar pontos</h1>
          <p className="hint-text" style={{ marginBottom: 16 }}>Entre pra comprar pontos.</p>
          <Link to="/entrar" className="btn" style={{ display: "block", textAlign: "center" }}>Entrar</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-narrow">
      <div className="card">
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, marginTop: 0 }}>Comprar pontos</h1>
        <p className="hint-text" style={{ marginBottom: 4 }}>
          Pontos são moeda recreativa da plataforma — como créditos de qualquer app. Dá pra ganhar
          jogando (bônus de cadastro, previsões certas) ou comprar pra ter mais saldo pra apostar.
        </p>
        <p className="hint-text" style={{ marginBottom: 16 }}>
          Não é possível sacar ou converter pontos de volta em dinheiro.
        </p>

        <div className="mono" style={{ fontSize: 28, fontWeight: 600, color: "var(--violeta)", marginBottom: 16 }}>
          {fmt(me?.balance ?? 0)} pts
        </div>

        {pending?.map((p) => (
          <div key={p.id} className="admin-row" style={{ marginBottom: 10 }}>
            <span className="titulo">
              {p.method === "PIX" ? "Pix" : "Boleto"} aguardando pagamento
              <div className="meta">{fmtBRL(p.amountCents)} · {fmt(p.points)} pts</div>
            </span>
            {p.method === "PIX" && p.qrCode && (
              <button type="button" className="btn-outline" style={{ width: "auto", padding: "8px 14px" }} onClick={() => onCopyQr(p.qrCode!)}>
                {copied ? "Copiado!" : "Copiar código Pix"}
              </button>
            )}
            {p.method === "BOLETO" && p.boletoUrl && (
              <a className="btn-outline" style={{ width: "auto", padding: "8px 14px" }} href={p.boletoUrl} target="_blank" rel="noopener noreferrer">
                Ver boleto
              </a>
            )}
          </div>
        ))}

        {lastResult?.qrCodeBase64 && (
          <div style={{ textAlign: "center", margin: "12px 0" }}>
            <img
              src={`data:image/png;base64,${lastResult.qrCodeBase64}`} alt="QR code Pix"
              style={{ width: 200, height: 200 }}
            />
          </div>
        )}

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "0 1 160px", marginBottom: 0 }}>
            <label className="label" htmlFor="topup-amount">Valor (R$)</label>
            <input
              className="input" id="topup-amount" inputMode="decimal" value={amount}
              onChange={(e) => { setAmount(e.target.value); setCardOk(false); setErr(null); }}
            />
          </div>
          <div className="field" style={{ flex: "0 1 160px", marginBottom: 0 }}>
            <label className="label" htmlFor="topup-method">Forma</label>
            <select
              id="topup-method" value={method}
              onChange={(e) => { setMethod(e.target.value as "PIX" | "BOLETO" | "CARD"); setErr(null); setCardOk(false); }}
            >
              <option value="PIX">Pix</option>
              <option value="BOLETO">Boleto</option>
              <option value="CARD">Cartão</option>
            </select>
          </div>
          {method !== "CARD" && (
            <button
              type="button" className="btn-outline" style={{ width: "auto", padding: "10px 18px" }}
              onClick={onTopup} disabled={createTopup.isPending}
            >
              {createTopup.isPending ? "Gerando…" : "Comprar"}
            </button>
          )}
        </div>
        {previewPoints !== null && amountCents > 0 && (
          <p className="hint-text" style={{ marginTop: 6 }}>≈ {fmt(previewPoints)} pontos</p>
        )}

        {method === "CARD" && config && (
          amountCents >= config.minTopupCents ? (
            <div style={{ marginTop: 12 }}>
              <MercadoPagoCardBrick
                amountCents={amountCents} payerEmail={me?.email ?? ""}
                onToken={onCardToken} onError={(msg) => setErr(msg)}
              />
            </div>
          ) : (
            <p className="hint-text" style={{ marginTop: 8 }}>
              Informe um valor de pelo menos {fmtBRL(config.minTopupCents)} pra continuar com cartão.
            </p>
          )
        )}
        {err && <p className="error-text" style={{ marginTop: 8 }}>{err}</p>}
        {cardOk && <p className="hint-text" style={{ marginTop: 8, color: "var(--conferido)" }}>Pagamento aprovado — saldo atualizado.</p>}
      </div>
    </main>
  );
}
