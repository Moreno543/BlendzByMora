/** Convert Square/API integer cents ↔ database dollar amounts (2 decimal places). */

export function centsToDollars(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return 0;
  return Number((n / 100).toFixed(2));
}

export function optionalCentsToDollars(cents) {
  if (cents == null) return null;
  return centsToDollars(cents);
}

export function dollarsToCents(dollars) {
  if (dollars == null) return null;
  const n = Number(dollars);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
