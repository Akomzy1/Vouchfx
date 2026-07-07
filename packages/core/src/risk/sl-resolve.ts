import type { SymbolSpec } from "./types";

export type SlUnit = "price" | "pips" | "percent";

/**
 * Price value of 1 pip for a symbol.
 *
 * NEVER derived from tickSize alone: tick size follows the broker's quote
 * precision, so the same "150 pips" setting would produce a 10× (or worse)
 * different stop on a 3-decimal gold feed than on a 2-decimal one. Pips are a
 * convention of the ASSET, not of the broker's price feed:
 *
 *   - Gold (XAU):    1 pip = 0.10 (10 cents) regardless of quote digits
 *   - Silver (XAG):  1 pip = 0.01
 *   - Everything else: standard MT5 fractional-pricing rule from quote digits —
 *     5/3-digit quotes are tenths of a pip (pip = 10 × point), 4/2-digit quotes
 *     are whole pips (pip = point)
 *   - No digits reported: legacy fallback of 10 × tickSize
 */
export function pipSizeFor(symbol: string, spec: SymbolSpec): number {
  const s = symbol.toUpperCase();
  if (s.includes("XAU") || s.includes("GOLD")) return 0.1;
  if (s.includes("XAG") || s.includes("SILVER")) return 0.01;
  if (spec.digits != null && spec.digits >= 1) {
    const point = Math.pow(10, -spec.digits);
    return spec.digits === 5 || spec.digits === 3 ? 10 * point : point;
  }
  return 10 * spec.tickSize;
}

/**
 * Resolve a stop-loss value to an absolute price distance (in price units).
 *
 * - price:   |entry - sl|  — caller passes the actual SL price
 * - pips:    sl * pipSizeFor(symbol)  — asset-convention pip, broker-independent
 * - percent: entry * (sl / 100)
 *
 * Returns NaN if inputs are invalid.
 */
export function resolveSlDistance(
  sl: number,
  slUnit: SlUnit,
  entryPrice: number,
  spec: SymbolSpec
): number {
  if (!isFinite(sl) || sl <= 0) return NaN;
  if (!isFinite(entryPrice) || entryPrice <= 0) return NaN;

  switch (slUnit) {
    case "price":
      return Math.abs(entryPrice - sl);
    case "pips":
      return sl * pipSizeFor(spec.symbol, spec);
    case "percent":
      return entryPrice * (sl / 100);
  }
}
