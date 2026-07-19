/**
 * Square card processing fee passed to the client (3.3% + $0.30 per transaction).
 */
function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

export function cardProcessingFeePercent() {
  return envNum('SQUARE_CARD_PROCESSING_FEE_PERCENT', 3.3);
}

export function cardProcessingFeeFixedCents() {
  return Math.max(0, Math.round(envNum('SQUARE_CARD_PROCESSING_FEE_FIXED_CENTS', 30)));
}

/** Fee on a single card payment (deposit or balance). */
export function cardProcessingFeeCents(baseCents) {
  const base = Math.max(0, Math.round(Number(baseCents) || 0));
  if (base < 1) return 0;
  const pct = cardProcessingFeePercent();
  return Math.round(base * (pct / 100)) + cardProcessingFeeFixedCents();
}

/** Total charged on the client's card for one payment. */
export function cardChargeTotalCents(baseCents) {
  const base = Math.max(0, Math.round(Number(baseCents) || 0));
  return base + cardProcessingFeeCents(base);
}

export function cardProcessingFeeLabel() {
  const fixed = cardProcessingFeeFixedCents();
  return `${cardProcessingFeePercent()}% + $${(fixed / 100).toFixed(2)}`;
}
