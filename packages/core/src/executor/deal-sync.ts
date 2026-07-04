/**
 * Deal-history sync — pure logic (no I/O).
 *
 * MetaApi deal history is the source of truth for realised P&L: every close —
 * whether VouchFX closed the position (CLOSE_ALL, drawdown cap, kill-switch)
 * or the BROKER did (TP/SL hit, stop-out) — produces a closing deal with the
 * exact account-currency profit. The executor's trade-sync job feeds deals
 * through these helpers to write trade_events rows (which the Performance
 * analytics sum) and to reconcile trades the broker closed on its own.
 */

/** A closing deal, normalised from MetaApi's deal shape. */
export interface CloseDeal {
  dealId: string;
  positionId: string;
  volume: number;
  price: number | null;
  /** Net realised P&L in account currency: profit + commission + swap. */
  pnl: number;
  /** ISO UTC timestamp of the deal. */
  time: string;
}

function num(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

/**
 * Extract the CLOSING deals (DEAL_ENTRY_OUT / OUT_BY) from a raw MetaApi deal
 * list. Entry deals, balance operations, and deals without a position id are
 * ignored. Net P&L folds in commission and swap so partial closes sum to the
 * position's true realised result.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractCloseDeals(rawDeals: any[]): CloseDeal[] {
  const out: CloseDeal[] = [];
  for (const d of rawDeals ?? []) {
    if (!d || d.positionId == null || d.id == null) continue;
    const entry = String(d.entryType ?? "");
    if (entry !== "DEAL_ENTRY_OUT" && entry !== "DEAL_ENTRY_OUT_BY") continue;
    const time = d.time ? new Date(d.time as string | number | Date) : null;
    out.push({
      dealId: String(d.id),
      positionId: String(d.positionId),
      volume: num(d.volume),
      price: d.price != null && isFinite(Number(d.price)) ? Number(d.price) : null,
      pnl: num(d.profit) + num(d.commission) + num(d.swap),
      time: time && !isNaN(time.getTime()) ? time.toISOString() : new Date(0).toISOString(),
    });
  }
  return out;
}

/** Volume tolerance for "fully closed" — broker lot steps are ≥ 0.01. */
const VOLUME_EPS = 0.001;

/** True when the summed closing volume covers the trade's volume. */
export function isFullyClosed(tradeVolume: number, totalClosedVolume: number): boolean {
  return totalClosedVolume >= tradeVolume - VOLUME_EPS;
}

export interface TradeCloseReconciliation {
  /** Events to record, oldest first (event_type set per cumulative coverage). */
  events: Array<CloseDeal & { eventType: "closed_partial" | "closed_full" }>;
  /** Whether the position is fully closed after these deals. */
  fullyClosed: boolean;
  /** ISO time of the final closing deal (closed_at candidate). */
  closedAt: string | null;
}

/**
 * Order a trade's closing deals chronologically and label each: the deal that
 * completes the position's volume is closed_full, earlier ones closed_partial.
 */
export function reconcileTradeCloses(tradeVolume: number, deals: CloseDeal[]): TradeCloseReconciliation {
  const sorted = [...deals].sort((a, b) => a.time.localeCompare(b.time));
  let cumulative = 0;
  const events = sorted.map((d) => {
    cumulative += d.volume;
    return { ...d, eventType: isFullyClosed(tradeVolume, cumulative) ? ("closed_full" as const) : ("closed_partial" as const) };
  });
  const fullyClosed = isFullyClosed(tradeVolume, cumulative);
  return {
    events,
    fullyClosed,
    closedAt: sorted.length > 0 ? sorted[sorted.length - 1]!.time : null,
  };
}
