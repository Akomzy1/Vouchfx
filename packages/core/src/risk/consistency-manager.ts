/**
 * Consistency Manager — VCH-PROP-05.
 *
 * Ensures no single trading day accounts for more than `consistencyPct` %
 * of the total realized profit for the current evaluation period.
 *
 * As the day's profit approaches the cap the manager:
 *   ok        — today's profit is well below the cap
 *   throttle  — profit is approaching the cap (≥ throttleThresholdPct of cap)
 *   pause     — today's profit has reached or exceeded the cap
 *
 * This is pure logic — it reads daily PnL rows but does not write them.
 * The executor writes to prop_daily_pnl on each trade close.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DailyPnlEntry {
  dayKey: string;       // 'YYYY-MM-DD'
  realizedPnlUsd: number;
}

export type ConsistencyAction = "ok" | "throttle" | "pause";

export interface ConsistencyStatus {
  action: ConsistencyAction;
  todayProfitUsd: number;
  periodTotalProfitUsd: number;
  /** Cap in USD = periodTotal × (consistencyPct / 100). */
  dailyCapUsd: number;
  /** today / cap as a percentage (0–100+). */
  utilizationPct: number;
  /** Remaining profit budget for today. null when paused. */
  remainingUsd: number | null;
  reason: string | null;
  /** Profit per day for the evaluation period (for the consistency meter chart). */
  profitDistribution: DailyPnlEntry[];
}

// ── Manager ───────────────────────────────────────────────────────────────────

export interface ConsistencyManagerConfig {
  consistencyPct: number;
  /**
   * Throttle once today's profit reaches this % of the daily cap.
   * Default: 85 (throttle at 85% of cap, pause at 100%).
   */
  throttleThresholdPct?: number;
}

/**
 * Compute the consistency status for an account given the period's daily PnL data.
 *
 * @param todayKey - 'YYYY-MM-DD' UTC key for the current trading day.
 * @param allDays  - All daily PnL rows for the evaluation period (sorted or unsorted).
 */
export function computeConsistencyStatus(
  config: ConsistencyManagerConfig,
  todayKey: string,
  allDays: DailyPnlEntry[],
): ConsistencyStatus {
  const throttleAt = config.throttleThresholdPct ?? 85;

  // Period total = sum of profitable PRIOR days (today excluded).
  // Excluding today gives a static cap for the current day — as today's profit
  // grows, the cap doesn't move, making the rule stable and predictable.
  const periodTotalProfitUsd = allDays
    .filter((d) => d.dayKey !== todayKey)
    .reduce((sum, d) => sum + (d.realizedPnlUsd > 0 ? d.realizedPnlUsd : 0), 0);

  const todayEntry = allDays.find((d) => d.dayKey === todayKey);
  const todayProfitUsd = Math.max(0, todayEntry?.realizedPnlUsd ?? 0);

  // If the account has no profit yet, no consistency rule applies
  if (periodTotalProfitUsd <= 0) {
    return {
      action: "ok",
      todayProfitUsd,
      periodTotalProfitUsd: 0,
      dailyCapUsd: 0,
      utilizationPct: 0,
      remainingUsd: null,
      reason: null,
      profitDistribution: allDays,
    };
  }

  const dailyCapUsd = periodTotalProfitUsd * (config.consistencyPct / 100);
  const utilizationPct =
    dailyCapUsd > 0 ? (todayProfitUsd / dailyCapUsd) * 100 : 0;
  const remainingUsd = Math.max(0, dailyCapUsd - todayProfitUsd);

  let action: ConsistencyAction = "ok";
  let reason: string | null = null;

  if (todayProfitUsd >= dailyCapUsd) {
    action = "pause";
    reason = `Today's profit $${r2(todayProfitUsd)} has reached the ${config.consistencyPct}% consistency cap ($${r2(dailyCapUsd)}). Copying paused for today.`;
  } else if (utilizationPct >= throttleAt) {
    action = "throttle";
    reason = `Today's profit $${r2(todayProfitUsd)} is at ${r2(utilizationPct)}% of the consistency cap ($${r2(dailyCapUsd)}). Throttling new signals.`;
  }

  return {
    action,
    todayProfitUsd,
    periodTotalProfitUsd,
    dailyCapUsd,
    utilizationPct,
    remainingUsd: action === "pause" ? null : remainingUsd,
    reason,
    profitDistribution: allDays,
  };
}

/**
 * Convenience: should new signals be blocked (pause or throttle past the hard cap)?
 * Returns the reason string if blocked, null if ok to proceed.
 */
export function consistencyBlockReason(status: ConsistencyStatus): string | null {
  return status.action === "pause" ? status.reason : null;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
