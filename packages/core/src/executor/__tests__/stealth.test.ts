import { describe, it, expect } from "vitest";
import { applyStealth, DEFAULT_STEALTH_CONFIG } from "../stealth";
import type { StealthInput } from "../stealth";

const BASE_INPUT: StealthInput = {
  lot: 0.10,
  lotMin: 0.01,
  lotMax: 100,
  volumeStep: 0.01,
  sl: 1.1000,
  tps: [1.1050, 1.1080],
  tickSize: 0.00001,
  side: "BUY",
};

// Seeded RNG for deterministic tests
function fixedRng(value: number) {
  return () => value;
}

// ── disabled stealth ──────────────────────────────────────────────────────────

describe("stealth disabled", () => {
  it("returns original values with zero delay", () => {
    const result = applyStealth(BASE_INPUT, { ...DEFAULT_STEALTH_CONFIG, enabled: false });
    expect(result.lot).toBe(0.10);
    expect(result.sl).toBe(1.1000);
    expect(result.tps).toEqual([1.1050, 1.1080]);
    expect(result.delayMs).toBe(0);
  });
});

// ── lot jitter ────────────────────────────────────────────────────────────────

describe("lot jitter", () => {
  it("does not change lot when rng returns 0.5 (no jitter)", () => {
    // rng = 0.5 → jitterFactor = 1 + (0.5 × 2 - 1) × 0.10 = 1 + 0 = 1
    const result = applyStealth(BASE_INPUT, DEFAULT_STEALTH_CONFIG, fixedRng(0.5));
    expect(result.lot).toBe(0.10);
  });

  it("increases lot when rng > 0.5", () => {
    // rng = 1 → jitterFactor = 1 + (1 × 2 - 1) × 0.10 = 1.10 → 0.10 × 1.10 = 0.11
    const result = applyStealth(BASE_INPUT, DEFAULT_STEALTH_CONFIG, fixedRng(1));
    expect(result.lot).toBeCloseTo(0.11, 2);
  });

  it("decreases lot when rng < 0.5", () => {
    // rng = 0 → jitterFactor = 1 + (0 × 2 - 1) × 0.10 = 0.90 → 0.10 × 0.90 = 0.09
    const result = applyStealth(BASE_INPUT, DEFAULT_STEALTH_CONFIG, fixedRng(0));
    expect(result.lot).toBeCloseTo(0.09, 2);
  });

  it("clamps lot to lotMin", () => {
    const input: StealthInput = { ...BASE_INPUT, lot: 0.01, lotMin: 0.01 };
    // rng = 0 → jitter down → 0.01 × 0.90 = 0.009 → clamped to 0.01
    const result = applyStealth(input, DEFAULT_STEALTH_CONFIG, fixedRng(0));
    expect(result.lot).toBeGreaterThanOrEqual(0.01);
  });

  it("rounds to volumeStep", () => {
    const result = applyStealth(BASE_INPUT, { ...DEFAULT_STEALTH_CONFIG, lotJitterFraction: 0.15 }, fixedRng(0.3));
    // Result should be a multiple of 0.01
    const dp2 = Math.round(result.lot * 100) / 100;
    expect(result.lot).toBe(dp2);
  });
});

// ── SL/TP jitter ──────────────────────────────────────────────────────────────

describe("SL/TP jitter — BUY side", () => {
  it("moves SL away from entry (downward) for BUY", () => {
    // rng = 1 → max positive jitter → slSign = -1 → SL decreases (safer for BUY)
    const result = applyStealth(BASE_INPUT, DEFAULT_STEALTH_CONFIG, fixedRng(1));
    expect(result.sl).toBeLessThanOrEqual(BASE_INPUT.sl!);
  });

  it("moves TP away from entry (upward) for BUY", () => {
    const result = applyStealth(BASE_INPUT, DEFAULT_STEALTH_CONFIG, fixedRng(1));
    const [tp0, tp1] = BASE_INPUT.tps;
    expect(result.tps[0]).toBeGreaterThanOrEqual(tp0 as number);
    expect(result.tps[1]).toBeGreaterThanOrEqual(tp1 as number);
  });
});

describe("SL/TP jitter — SELL side", () => {
  it("moves SL away from entry (upward) for SELL", () => {
    const input: StealthInput = { ...BASE_INPUT, side: "SELL", sl: 1.1100, tps: [1.1050, 1.1020] };
    const result = applyStealth(input, DEFAULT_STEALTH_CONFIG, fixedRng(1));
    expect(result.sl).toBeGreaterThanOrEqual(input.sl!);
  });
});

describe("null SL handling", () => {
  it("returns null SL unchanged", () => {
    const input: StealthInput = { ...BASE_INPUT, sl: null };
    const result = applyStealth(input, DEFAULT_STEALTH_CONFIG, fixedRng(0.5));
    expect(result.sl).toBeNull();
  });
});

// ── Micro-delay ───────────────────────────────────────────────────────────────

describe("delayMs", () => {
  it("delay is within the configured range", () => {
    // Multiple runs with different rng values
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      const result = applyStealth(BASE_INPUT, DEFAULT_STEALTH_CONFIG, fixedRng(v));
      expect(result.delayMs).toBeGreaterThanOrEqual(DEFAULT_STEALTH_CONFIG.delayRangeMs[0]);
      expect(result.delayMs).toBeLessThanOrEqual(DEFAULT_STEALTH_CONFIG.delayRangeMs[1]);
    }
  });
});

// ── Uniqueness across two accounts (same signal → different orders) ───────────

describe("two accounts copying the same signal place non-identical orders", () => {
  it("produces different lots when rng varies", () => {
    const r1 = applyStealth(BASE_INPUT, DEFAULT_STEALTH_CONFIG, fixedRng(0.2));
    const r2 = applyStealth(BASE_INPUT, DEFAULT_STEALTH_CONFIG, fixedRng(0.8));
    // They may coincidentally round to the same step — check at least one differs
    const anyDiffers =
      r1.lot !== r2.lot || r1.sl !== r2.sl || r1.tps[0] !== r2.tps[0] || r1.delayMs !== r2.delayMs;
    expect(anyDiffers).toBe(true);
  });
});
