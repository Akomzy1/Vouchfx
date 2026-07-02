/**
 * Performance analytics — pure metric formulas (PRD §6.15, VCH-PERF-03/04/05).
 *
 * No I/O. The SQL RPCs (packages/db migration 036) do the heavy aggregation and
 * return raw scalar COMPONENTS; the ratio/derivation formulas live here so they
 * are unit-tested in one place and divide-by-zero is handled uniformly. The
 * reference impl `computeMetricsFromTrades` recomputes everything from raw trade
 * rows and is the fixture-tested source of truth for the SQL to mirror.
 *
 * Realised stats only — callers pass CLOSED trades' net P&L. Floating P&L is
 * never passed in here (it is surfaced separately in the UI).
 */

/** A closed trade reduced to what the metrics need. `closedAt` is an ISO UTC string. */
export interface ClosedTradePoint {
  pnl: number;
  closedAt: string;
}

/** Raw components an aggregation (SQL or the reference impl) produces. */
export interface PerfComponents {
  netPnl: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  /** Sum of positive trade P&L. */
  grossProfit: number;
  /** Positive magnitude of the sum of negative trade P&L. */
  grossLoss: number;
  /** Distinct calendar days (in the display tz) with ≥1 closed trade. */
  tradingDays: number;
  /** Days whose net P&L > 0. */
  greenDays: number;
}

export interface PerfMetrics extends PerfComponents {
  /** winning ÷ total, as a percent (0 when no trades). */
  tradeWinPct: number;
  /** green days ÷ trading days, as a percent (0 when no trading days). */
  dayWinPct: number;
  /** gross profit ÷ gross loss; null when there are no losses (undefined ratio). */
  profitFactor: number | null;
  /** Mean winning trade (≥ 0; 0 when no wins). */
  avgWin: number;
  /** Mean losing trade (≤ 0; 0 when no losses). */
  avgLoss: number;
  /** total trades ÷ trading days (0 when no trading days). */
  avgTradesPerDay: number;
}

// ── Individual formulas (each independently testable) ────────────────────────

export function tradeWinPct(winningTrades: number, totalTrades: number): number {
  return totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
}

export function dayWinPct(greenDays: number, tradingDays: number): number {
  return tradingDays > 0 ? (greenDays / tradingDays) * 100 : 0;
}

/** gross profit ÷ gross loss. Null when gross loss is 0 (ratio is undefined). */
export function profitFactor(grossProfit: number, grossLoss: number): number | null {
  return grossLoss > 0 ? grossProfit / grossLoss : null;
}

export function avgWin(grossProfit: number, winningTrades: number): number {
  return winningTrades > 0 ? grossProfit / winningTrades : 0;
}

/** Returns a value ≤ 0 (the average loss is a negative number). */
export function avgLoss(grossLoss: number, losingTrades: number): number {
  return losingTrades > 0 ? -(grossLoss / losingTrades) : 0;
}

export function avgTradesPerDay(totalTrades: number, tradingDays: number): number {
  return tradingDays > 0 ? totalTrades / tradingDays : 0;
}

/** Derive the full metric set from raw components (what the API calls on SQL output). */
export function deriveMetrics(c: PerfComponents): PerfMetrics {
  return {
    ...c,
    tradeWinPct: tradeWinPct(c.winningTrades, c.totalTrades),
    dayWinPct: dayWinPct(c.greenDays, c.tradingDays),
    profitFactor: profitFactor(c.grossProfit, c.grossLoss),
    avgWin: avgWin(c.grossProfit, c.winningTrades),
    avgLoss: avgLoss(c.grossLoss, c.losingTrades),
    avgTradesPerDay: avgTradesPerDay(c.totalTrades, c.tradingDays),
  };
}

// ── Timezone day-bucketing (VCH-PERF-05) ─────────────────────────────────────

/**
 * The calendar day (YYYY-MM-DD) a UTC instant falls on in the user's display
 * timezone — mirrors the SQL `(closed_at AT TIME ZONE tz)::date`. Uses en-CA so
 * Intl formats as an ISO date. A trade closing 23:59 vs 00:01 local lands in the
 * correct day (tested).
 */
export function bucketDayKey(isoUtc: string, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(isoUtc));
}

// ── Reference implementation (fixture-tested source of truth) ─────────────────

/**
 * Compute the full metric set from raw closed-trade rows, bucketing days in the
 * given display timezone. The SQL RPCs mirror this; the tests pin both to the
 * same hand-computed fixtures.
 */
export function computeMetricsFromTrades(trades: ClosedTradePoint[], tz: string): PerfMetrics {
  let netPnl = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  const dayNet = new Map<string, number>();

  for (const t of trades) {
    netPnl += t.pnl;
    if (t.pnl > 0) {
      grossProfit += t.pnl;
      winningTrades += 1;
    } else if (t.pnl < 0) {
      grossLoss += -t.pnl;
      losingTrades += 1;
    }
    const key = bucketDayKey(t.closedAt, tz);
    dayNet.set(key, (dayNet.get(key) ?? 0) + t.pnl);
  }

  let greenDays = 0;
  for (const v of dayNet.values()) if (v > 0) greenDays += 1;

  return deriveMetrics({
    netPnl,
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    grossProfit,
    grossLoss,
    tradingDays: dayNet.size,
    greenDays,
  });
}

// ── Equity curve + per-channel derivation ────────────────────────────────────

export interface DailyNet {
  day: string;
  netPnl: number;
}

/** Running cumulative of daily net P&L for the equity curve (input must be date-sorted). */
export function cumulativeSeries(daily: DailyNet[]): Array<{ day: string; cumulative: number }> {
  let running = 0;
  return daily.map((d) => {
    running += d.netPnl;
    return { day: d.day, cumulative: running };
  });
}

/** Per-channel raw components from the SQL channel RPC. */
export interface ChannelComponents {
  sourceId: string;
  channel: string;
  netPnl: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  grossProfit: number;
  grossLoss: number;
}

export interface ChannelRow extends ChannelComponents {
  winPct: number;
  profitFactor: number | null;
  avgWin: number;
  avgLoss: number;
}

export function deriveChannelRow(c: ChannelComponents): ChannelRow {
  return {
    ...c,
    winPct: tradeWinPct(c.winningTrades, c.totalTrades),
    profitFactor: profitFactor(c.grossProfit, c.grossLoss),
    avgWin: avgWin(c.grossProfit, c.winningTrades),
    avgLoss: avgLoss(c.grossLoss, c.losingTrades),
  };
}
