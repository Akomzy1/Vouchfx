/**
 * Equity Guardian — real-time, streaming floor enforcement (VCH-PROP-03).
 *
 * Consumes MetaApi equity ticks and decides:
 *   ok          — trade may proceed
 *   pre_block   — equity is within the configured buffer of the floor; block new signals
 *   flatten_now — equity has reached or breached the floor; close all positions immediately
 *
 * This is latency-sensitive and runs in the executor worker, co-located with MetaApi.
 * State is persisted to prop_equity_state after each tick so restarts are seamless.
 *
 * Uses drawdown-tracker.ts for floor math (single source of truth).
 */

import {
  computeDrawdownFloor,
  computeDailyLossFloor,
  computeEffectiveFloor,
  type DrawdownModel,
  type DailyLossBasis,
} from "./drawdown-tracker";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EquityGuardianConfig {
  dailyLossPct: number;
  dailyLossBasis: DailyLossBasis;
  maxDrawdownPct: number;
  maxDrawdownModel: DrawdownModel;
  challengeStartBalanceUsd: number;
  /**
   * Pre-block zone width expressed as % of challengeStartBalance.
   * New signals are blocked when equity is within this distance above the floor.
   * Default: 0.5 (0.5% of starting balance).
   */
  bufferPct: number;
}

export interface EquitySnapshot {
  equityUsd: number;
  balanceUsd: number;
  timestampMs: number;
}

export type GuardianDecision =
  | { action: "ok" }
  | {
      action: "pre_block";
      reason: string;
      floorUsd: number;
      bufferRemainingUsd: number;
      dailyLossFloorUsd: number;
      drawdownFloorUsd: number;
    }
  | {
      action: "flatten_now";
      reason: string;
      floorUsd: number;
      dailyLossFloorUsd: number;
      drawdownFloorUsd: number;
    };

export interface EquityGuardianPersistedState {
  dayStartEquityUsd: number;
  dayStartBalanceUsd: number;
  peakEquityUsd: number;
  eodPeakBalanceUsd: number;
  currentDayKey: string;
  lastEquityUsd: number;
  lastBalanceUsd: number;
}

// ── Guardian ──────────────────────────────────────────────────────────────────

export class EquityGuardian {
  private dayStartEquityUsd: number;
  private dayStartBalanceUsd: number;
  private peakEquityUsd: number;
  private eodPeakBalanceUsd: number;
  private currentDayKey: string;
  private lastEquityUsd: number;
  private lastBalanceUsd: number;

  constructor(
    private readonly config: EquityGuardianConfig,
    state: EquityGuardianPersistedState,
  ) {
    this.dayStartEquityUsd  = state.dayStartEquityUsd;
    this.dayStartBalanceUsd = state.dayStartBalanceUsd;
    this.peakEquityUsd      = state.peakEquityUsd;
    this.eodPeakBalanceUsd  = state.eodPeakBalanceUsd;
    this.currentDayKey      = state.currentDayKey;
    this.lastEquityUsd      = state.lastEquityUsd;
    this.lastBalanceUsd     = state.lastBalanceUsd;
  }

  /**
   * Construct a fresh guardian for a newly connected account.
   * Caller should persist `getState()` immediately after construction.
   */
  static create(
    config: EquityGuardianConfig,
    initialEquity: number,
    initialBalance: number,
    timestampMs: number,
  ): EquityGuardian {
    return new EquityGuardian(config, {
      dayStartEquityUsd:  initialEquity,
      dayStartBalanceUsd: initialBalance,
      peakEquityUsd:      initialEquity,
      eodPeakBalanceUsd:  initialBalance,
      currentDayKey:      utcDayKey(timestampMs),
      lastEquityUsd:      initialEquity,
      lastBalanceUsd:     initialBalance,
    });
  }

  /**
   * Process one equity tick from MetaApi's streaming API.
   * Called on every equity/balance update; must be fast.
   */
  onEquityTick(snapshot: EquitySnapshot): GuardianDecision {
    const dayKey = utcDayKey(snapshot.timestampMs);

    // New UTC day → reset intraday anchors
    if (dayKey !== this.currentDayKey) {
      this.dayStartEquityUsd  = snapshot.equityUsd;
      this.dayStartBalanceUsd = snapshot.balanceUsd;
      this.currentDayKey      = dayKey;
      // Note: peakEquityUsd is NOT reset — intraday_trailing model tracks
      // all-time peak, not per-day peak. EOD peak is updated via onEodSnapshot.
    }

    // Update all-time intraday equity peak
    if (snapshot.equityUsd > this.peakEquityUsd) {
      this.peakEquityUsd = snapshot.equityUsd;
    }

    this.lastEquityUsd  = snapshot.equityUsd;
    this.lastBalanceUsd = snapshot.balanceUsd;

    // Compute floors
    const dailyLossFloorUsd = computeDailyLossFloor(this.config.dailyLossBasis, {
      dayStartEquityUsd:  this.dayStartEquityUsd,
      dayStartBalanceUsd: this.dayStartBalanceUsd,
      dailyLossPct:       this.config.dailyLossPct,
    });
    const drawdownFloorUsd = computeDrawdownFloor(this.config.maxDrawdownModel, {
      challengeStartBalanceUsd: this.config.challengeStartBalanceUsd,
      peakEquityUsd:            this.peakEquityUsd,
      eodPeakBalanceUsd:        this.eodPeakBalanceUsd,
      maxDrawdownPct:           this.config.maxDrawdownPct,
    });
    const floorUsd = computeEffectiveFloor(dailyLossFloorUsd, drawdownFloorUsd);

    // Flatten now: equity at or below the floor
    if (snapshot.equityUsd <= floorUsd) {
      const isDailyBreach = dailyLossFloorUsd >= drawdownFloorUsd;
      return {
        action: "flatten_now",
        reason: isDailyBreach
          ? `Daily loss floor breached: equity $${r2(snapshot.equityUsd)} ≤ floor $${r2(dailyLossFloorUsd)} (limit ${this.config.dailyLossPct}% of ${this.config.dailyLossBasis})`
          : `Drawdown floor breached: equity $${r2(snapshot.equityUsd)} ≤ floor $${r2(drawdownFloorUsd)} (model: ${this.config.maxDrawdownModel})`,
        floorUsd,
        dailyLossFloorUsd,
        drawdownFloorUsd,
      };
    }

    // Pre-block: within the configurable buffer zone
    const bufferUsd = this.config.challengeStartBalanceUsd * (this.config.bufferPct / 100);
    const bufferRemainingUsd = snapshot.equityUsd - floorUsd;
    if (bufferRemainingUsd <= bufferUsd) {
      return {
        action: "pre_block",
        reason: `Equity $${r2(snapshot.equityUsd)} is within ${this.config.bufferPct}% buffer of floor $${r2(floorUsd)} — new signals blocked until headroom is restored`,
        floorUsd,
        bufferRemainingUsd,
        dailyLossFloorUsd,
        drawdownFloorUsd,
      };
    }

    return { action: "ok" };
  }

  /**
   * Call at broker end-of-day (or on startup to hydrate from stored balance).
   * Advances the EOD peak used by the eod_trailing drawdown model.
   */
  onEodSnapshot(balanceUsd: number): void {
    if (balanceUsd > this.eodPeakBalanceUsd) {
      this.eodPeakBalanceUsd = balanceUsd;
    }
  }

  /** Current floors for dashboard display (no tick required). */
  getCurrentFloors(): {
    dailyLossFloorUsd: number;
    drawdownFloorUsd: number;
    effectiveFloorUsd: number;
  } {
    const dailyLossFloorUsd = computeDailyLossFloor(this.config.dailyLossBasis, {
      dayStartEquityUsd:  this.dayStartEquityUsd,
      dayStartBalanceUsd: this.dayStartBalanceUsd,
      dailyLossPct:       this.config.dailyLossPct,
    });
    const drawdownFloorUsd = computeDrawdownFloor(this.config.maxDrawdownModel, {
      challengeStartBalanceUsd: this.config.challengeStartBalanceUsd,
      peakEquityUsd:            this.peakEquityUsd,
      eodPeakBalanceUsd:        this.eodPeakBalanceUsd,
      maxDrawdownPct:           this.config.maxDrawdownPct,
    });
    return {
      dailyLossFloorUsd,
      drawdownFloorUsd,
      effectiveFloorUsd: computeEffectiveFloor(dailyLossFloorUsd, drawdownFloorUsd),
    };
  }

  /** Serialize to `prop_equity_state` row fields. */
  getState(): EquityGuardianPersistedState {
    return {
      dayStartEquityUsd:  this.dayStartEquityUsd,
      dayStartBalanceUsd: this.dayStartBalanceUsd,
      peakEquityUsd:      this.peakEquityUsd,
      eodPeakBalanceUsd:  this.eodPeakBalanceUsd,
      currentDayKey:      this.currentDayKey,
      lastEquityUsd:      this.lastEquityUsd,
      lastBalanceUsd:     this.lastBalanceUsd,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function utcDayKey(timestampMs: number): string {
  const d = new Date(timestampMs);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
