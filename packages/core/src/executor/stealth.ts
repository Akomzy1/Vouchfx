/**
 * Stealth execution — VCH-PROP-08.
 *
 * Applies randomised variation to prop-account orders to reduce copy-group
 * detection: slight lot jitter, SL/TP variation, micro-delays, neutral comments.
 *
 * Stealth reduces — but does not eliminate — the risk of copy-group detection.
 * This must be clearly communicated in the UI (see Prop Mode screen).
 *
 * All variation keeps the trade inside the user's risk budget:
 *   - Lot stays within [lotMin, lotMax] bounds from the risk engine.
 *   - SL/TP variation is small (≤ slTpJitterPips pips) and does not flip the trade.
 *
 * Pure functions — no I/O, deterministic given a seeded RNG (testable).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StealthConfig {
  /** Enable stealth (default: true for prop accounts). */
  enabled: boolean;
  /**
   * Max lot variation as a fraction of the computed lot.
   * e.g. 0.10 → lot may vary by ±10%.
   * Default: 0.10.
   */
  lotJitterFraction: number;
  /**
   * Max SL/TP variation in pips.
   * Applied independently to each level with a random sign.
   * Default: 2.
   */
  slTpJitterPips: number;
  /**
   * Execution delay range in milliseconds [min, max].
   * Default: [200, 1500].
   */
  delayRangeMs: [number, number];
  /**
   * Order comment template. Use an empty string or generic text only.
   * Never include the channel name, user ID, or signal source.
   * Default: '' (broker assigns default).
   */
  orderComment: string;
}

export const DEFAULT_STEALTH_CONFIG: StealthConfig = {
  enabled: true,
  lotJitterFraction: 0.1,
  slTpJitterPips: 2,
  delayRangeMs: [200, 1500],
  orderComment: "",
};

export interface StealthInput {
  /** Computed lot from the risk engine. */
  lot: number;
  /** Min allowed lot (from broker symbol spec). */
  lotMin: number;
  /** Max allowed lot (from broker symbol spec). */
  lotMax: number;
  /** Volume step for the symbol (e.g. 0.01). */
  volumeStep: number;
  /** SL price (null if none). */
  sl: number | null;
  /** TP prices (may be empty). */
  tps: number[];
  /** Tick size for the symbol (e.g. 0.00001 for 5-decimal forex). */
  tickSize: number;
  /** Signal side: 'BUY' | 'SELL'. */
  side: "BUY" | "SELL";
}

export interface StealthOutput {
  lot: number;
  sl: number | null;
  tps: number[];
  /** Milliseconds to wait before placing the order. */
  delayMs: number;
  comment: string;
}

// ── Applier ───────────────────────────────────────────────────────────────────

/**
 * Apply stealth variation to an order.
 *
 * @param input   Order parameters from the risk engine.
 * @param config  Stealth config from the user's prop account settings.
 * @param rng     Random number generator; `Math.random` in production,
 *                seeded function in tests.
 */
export function applyStealth(
  input: StealthInput,
  config: StealthConfig,
  rng: () => number = Math.random,
): StealthOutput {
  if (!config.enabled) {
    return {
      lot: input.lot,
      sl: input.sl,
      tps: input.tps,
      delayMs: 0,
      comment: config.orderComment,
    };
  }

  // Lot jitter: vary by ±lotJitterFraction, then round to volumeStep
  const jitterFactor = 1 + (rng() * 2 - 1) * config.lotJitterFraction;
  const jitteredLot = clampToStep(
    input.lot * jitterFactor,
    input.lotMin,
    input.lotMax,
    input.volumeStep,
  );

  // SL/TP jitter: ±slTpJitterPips, rounded to tickSize
  // For BUY: SL is below entry — jitter SL downward (safer) or slightly upward
  //           TP is above entry — jitter TP upward or slightly downward
  // We apply a random sign independently to SL and each TP.
  // Invariant: jitter must not push SL above entry or TP below entry (enforced by sign convention).
  const pipsTicks = 10; // 1 pip = 10 ticks for 5-decimal instruments
  const jitterTicks = Math.round(rng() * config.slTpJitterPips * pipsTicks);
  const jitterPrice = jitterTicks * input.tickSize;

  // For SL: BUY → SL is below → move it further down (away from entry) = safer
  //         SELL → SL is above → move it further up (away from entry) = safer
  const slSign = input.side === "BUY" ? -1 : 1;
  const jitteredSl =
    input.sl !== null
      ? roundToTick(input.sl + slSign * jitterPrice, input.tickSize)
      : null;

  // For TPs: BUY → TP above entry → move further up; SELL → TP below entry → move further down
  const tpSign = input.side === "BUY" ? 1 : -1;
  const jitteredTps = input.tps.map((tp) =>
    roundToTick(tp + tpSign * (Math.round(rng() * config.slTpJitterPips * pipsTicks) * input.tickSize), input.tickSize),
  );

  // Micro-delay
  const [delayMin, delayMax] = config.delayRangeMs;
  const delayMs = Math.round(delayMin + rng() * (delayMax - delayMin));

  return {
    lot: jitteredLot,
    sl: jitteredSl,
    tps: jitteredTps,
    delayMs,
    comment: config.orderComment,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampToStep(
  value: number,
  min: number,
  max: number,
  step: number,
): number {
  const steps = Math.round(value / step);
  const snapped = steps * step;
  return Math.max(min, Math.min(max, parseFloat(snapped.toFixed(decimalPlaces(step)))));
}

function roundToTick(value: number, tickSize: number): number {
  const dp = decimalPlaces(tickSize);
  return parseFloat((Math.round(value / tickSize) * tickSize).toFixed(dp));
}

function decimalPlaces(n: number): number {
  const s = n.toString();
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}
