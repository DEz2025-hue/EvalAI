// Money arithmetic in integer minor units (cents). Floating-point sums such as 0.1 + 0.2 never reach a
// stored or displayed total: every price is rounded to the currency's minor unit first, line totals are
// computed from integers, and the quotation total is the exact sum of its line totals.

/** ISO 4217 currencies whose minor unit is not 2 decimals. Anything else uses 2. */
const MINOR_DIGITS: Record<string, number> = {
  JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, UGX: 0, RWF: 0, XAF: 0, XOF: 0, PYG: 0,
  BHD: 3, KWD: 3, OMR: 3, JOD: 3, TND: 3,
};

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

/** Round half away from zero (so 1.005 -> 1.01 in cents, not the binary-float 1.00). */
function roundHalfAwayFromZero(n: number): number {
  const sign = n < 0 ? -1 : 1;
  // Nudge by a relative epsilon so decimal ties that binary floats store just below .5 round up.
  return sign * Math.round(Math.abs(n) * (1 + Number.EPSILON));
}

export function toMinor(amount: number, currency: string): number {
  if (!Number.isFinite(amount)) throw new Error("Invalid amount");
  return roundHalfAwayFromZero(amount * 10 ** minorDigits(currency));
}

export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** minorDigits(currency);
}

export type PricedLine = { quantity: number; unitPrice: number; currency?: string; taxesOrFees?: number };

/** Line total in minor units: quantity x unit price (price rounded to the minor unit first) + taxes/fees. */
export function lineTotalMinor(line: PricedLine, currency: string): number {
  if (!Number.isFinite(line.quantity) || line.quantity < 0) throw new Error("Invalid quantity");
  if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) throw new Error("Invalid unit price");
  const fees = line.taxesOrFees ?? 0;
  if (!Number.isFinite(fees) || fees < 0) throw new Error("Invalid taxes or fees");
  return roundHalfAwayFromZero(line.quantity * toMinor(line.unitPrice, currency)) + toMinor(fees, currency);
}

/** Every line must be priced in the quotation's currency — mixed currencies cannot be summed. */
export function assertSingleCurrency(lines: Array<{ currency?: string }>, currency: string): void {
  const bad = lines.find((l) => l.currency !== undefined && l.currency.toUpperCase() !== currency.toUpperCase());
  if (bad) throw new Error(`All lines must use ${currency.toUpperCase()} — found ${bad.currency?.toUpperCase()}`);
}

export function lineTotalAmount(line: PricedLine, currency: string): number {
  return fromMinor(lineTotalMinor(line, currency), currency);
}

/** Exact total of a quotation as a major-unit number (sum of integer line totals). */
export function quotationTotalAmount(lines: PricedLine[], currency: string): number {
  assertSingleCurrency(lines, currency);
  return fromMinor(lines.reduce((sum, l) => sum + lineTotalMinor(l, currency), 0), currency);
}

/** Display with the currency's own number of decimals, e.g. "1234.50" or "1235" for JPY. */
export function formatAmount(amount: number, currency: string): string {
  return Number.isFinite(amount) ? amount.toFixed(minorDigits(currency)) : "—";
}
