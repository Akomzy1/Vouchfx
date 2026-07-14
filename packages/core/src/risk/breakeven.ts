/**
 * Breakeven-at-1R — move the stop to entry once the trade is in profit by the
 * same distance as its stop loss ("1R", risk-to-reward 1:1).
 *
 * Pure decision logic only (VCH-RSK-05 companion): the executor's breakeven
 * watch feeds in live prices and performs the broker modification. The SL
 * distance is measured from the trade's CURRENT stop — if a follow-up already
 * moved the stop, the trigger distance moves with it.
 */

export interface BreakevenCheckInput {
  side: "BUY" | "SELL";
  /** Fill price of the position. */
  entryPrice: number;
  /** Current stop-loss price (null = no stop → never eligible). */
  sl: number | null;
  /** Live closable price for the position (bid for BUY, ask for SELL). */
  currentPrice: number;
}

/**
 * True when the position should have its SL moved to entry:
 *   - it has a protective stop (below entry for BUY, above for SELL), and
 *   - price has moved in the trade's favour by at least the entry↔SL distance.
 *
 * A stop already at/through entry (breakeven or in-profit stop) returns false —
 * there is nothing left to protect.
 */
export function shouldMoveToBreakeven(input: BreakevenCheckInput): boolean {
  const { side, entryPrice, sl, currentPrice } = input;

  if (sl === null) return false;
  if (!isFinite(entryPrice) || entryPrice <= 0) return false;
  if (!isFinite(sl) || sl <= 0) return false;
  if (!isFinite(currentPrice) || currentPrice <= 0) return false;

  const slDistance = side === "BUY" ? entryPrice - sl : sl - entryPrice;
  if (slDistance <= 0) return false; // stop already at/past entry

  const profitDistance = side === "BUY" ? currentPrice - entryPrice : entryPrice - currentPrice;
  return profitDistance >= slDistance;
}
