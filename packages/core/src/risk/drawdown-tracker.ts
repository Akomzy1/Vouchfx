/**
 * Drawdown Tracker — pure floor-computation functions (VCH-PROP-04).
 *
 * Supports all three prop-firm drawdown models:
 *   static           — floor anchored to the initial challenge deposit; never moves up.
 *   eod_trailing     — floor trails the highest end-of-day balance achieved.
 *   intraday_trailing — floor trails the highest intraday equity tick ever recorded.
 *
 * These functions are shared by prop-gate.ts (pre-trade check) and
 * equity-guardian.ts (streaming enforcement). No I/O.
 */

export type DrawdownModel = "static" | "eod_trailing" | "intraday_trailing";
export type DailyLossBasis = "equity" | "balance";

// ── Floor computation ─────────────────────────────────────────────────────────

export interface DrawdownFloorParams {
  challengeStartBalanceUsd: number;
  peakEquityUsd: number;
  eodPeakBalanceUsd: number;
  maxDrawdownPct: number;
}

/**
 * Compute the drawdown floor in USD for the given model.
 * Floor = reference × (1 - maxDrawdownPct / 100).
 */
export function computeDrawdownFloor(
  model: DrawdownModel,
  params: DrawdownFloorParams,
): number {
  switch (model) {
    case "static":
      return params.challengeStartBalanceUsd * (1 - params.maxDrawdownPct / 100);
    case "eod_trailing":
      return params.eodPeakBalanceUsd * (1 - params.maxDrawdownPct / 100);
    case "intraday_trailing":
      return params.peakEquityUsd * (1 - params.maxDrawdownPct / 100);
  }
}

export interface DailyLossFloorParams {
  dayStartEquityUsd: number;
  dayStartBalanceUsd: number;
  dailyLossPct: number;
}

/**
 * Compute the daily-loss floor in USD.
 * Basis = equity → uses dayStartEquity.
 * Basis = balance → uses dayStartBalance.
 */
export function computeDailyLossFloor(
  basis: DailyLossBasis,
  params: DailyLossFloorParams,
): number {
  const reference =
    basis === "equity" ? params.dayStartEquityUsd : params.dayStartBalanceUsd;
  return reference * (1 - params.dailyLossPct / 100);
}

/**
 * The operative floor is the more restrictive (higher) of the two floors.
 * A signal must not push equity below this value.
 */
export function computeEffectiveFloor(
  dailyLossFloor: number,
  drawdownFloor: number,
): number {
  return Math.max(dailyLossFloor, drawdownFloor);
}

// ── Dashboard status ──────────────────────────────────────────────────────────

/** Dashboard-facing drawdown status for a single prop account. */
export interface DrawdownStatus {
  model: DrawdownModel;
  challengeStartBalanceUsd: number;
  currentEquityUsd: number;
  drawdownFloorUsd: number;
  dailyLossFloorUsd: number;
  effectiveFloorUsd: number;
  /** Current equity as % of challengeStart. */
  currentEquityPct: number;
  /** Effective floor as % of challengeStart. */
  floorPct: number;
  /** Headroom above effective floor as % of challengeStart. */
  headroomPct: number;
  /** True if equity has breached or is exactly at the effective floor. */
  breached: boolean;
}

export function buildDrawdownStatus(params: {
  model: DrawdownModel;
  challengeStartBalanceUsd: number;
  currentEquityUsd: number;
  drawdownFloorUsd: number;
  dailyLossFloorUsd: number;
}): DrawdownStatus {
  const effectiveFloorUsd = computeEffectiveFloor(
    params.dailyLossFloorUsd,
    params.drawdownFloorUsd,
  );
  const cs = params.challengeStartBalanceUsd;
  const safeDiv = (a: number) => (cs > 0 ? (a / cs) * 100 : 0);

  return {
    model: params.model,
    challengeStartBalanceUsd: cs,
    currentEquityUsd: params.currentEquityUsd,
    drawdownFloorUsd: params.drawdownFloorUsd,
    dailyLossFloorUsd: params.dailyLossFloorUsd,
    effectiveFloorUsd,
    currentEquityPct: safeDiv(params.currentEquityUsd),
    floorPct: safeDiv(effectiveFloorUsd),
    headroomPct: safeDiv(params.currentEquityUsd - effectiveFloorUsd),
    breached: params.currentEquityUsd <= effectiveFloorUsd,
  };
}
