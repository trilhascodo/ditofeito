-- Recarga de saldo do sponsor por cartão de crédito/débito (Mercado Pago Card
-- Payment Brick — tokenização no navegador, backend nunca vê número/CVV).
ALTER TABLE sponsor_payments DROP CONSTRAINT IF EXISTS sponsor_payments_method_check;
ALTER TABLE sponsor_payments ADD CONSTRAINT sponsor_payments_method_check
  CHECK (method IN ('PIX', 'BOLETO', 'CARD'));

-- payment_method_id da resposta do Mercado Pago (master/visa/elo…) e os 4
-- últimos dígitos — só pro extrato do sponsor mostrar "Cartão final 1234",
-- nunca o PAN completo.
ALTER TABLE sponsor_payments
  ADD COLUMN card_last4 text,
  ADD COLUMN card_brand text;
