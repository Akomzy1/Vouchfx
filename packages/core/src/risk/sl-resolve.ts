import type { SymbolSpec } from "./types";

export type SlUnit = "price" | "pips" | "percent";

/**
 * Resolve a stop-loss value to an absolute price distance (in price units).
 *
 * - price:   |entry - sl|  — caller passes the actual SL price
 * - pips:    sl * 10 * tickSize  (1 pip = 10 ticks, MT5 standard for 5-decimal forex & XAUUSD)
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
      return sl * 10 * spec.tickSize;
    case "percent":
      return entryPrice * (sl / 100);
  }
}
