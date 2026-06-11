import { describe, it, expect } from "vitest";
import { roundToStep, clampVolume, computeVolume } from "../sizing";
import { resolveSlDistance } from "../sl-resolve";
import { gateAndSize } from "../gate";
import type { SymbolSpec, RiskSettings } from "../types";
import { DEFAULT_RISK_SETTINGS } from "../types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const EURUSD: SymbolSpec = {
  symbol: "EURUSD",
  contractSize: 100_000,
  tickSize: 0.00001,
  tickValue: 1.0,    // USD per tick per 1 lot
  volumeStep: 0.01,
  volumeMin: 0.01,
  volumeMax: 500,
};

const XAUUSD: SymbolSpec = {
  symbol: "XAUUSD",
  contractSize: 100,
  tickSize: 0.01,
  tickValue: 1.0,
  volumeStep: 0.01,
  volumeMin: 0.01,
  volumeMax: 50,
};

const SETTINGS: RiskSettings = {
  ...DEFAULT_RISK_SETTINGS,
  mode: "percent_balance",
  riskPercent: 1,    // 1% risk
  defaultSlPips: 20,
  defaultSlPolicy: "skip",
};

// ── roundToStep ───────────────────────────────────────────────────────────────

describe("roundToStep", () => {
  it("rounds down to the nearest step", () => {
    expect(roundToStep(1.234, 0.01)).toBeCloseTo(1.23, 5);
  });

  it("keeps exact multiples unchanged", () => {
    expect(roundToStep(0.05, 0.01)).toBeCloseTo(0.05, 5);
  });

  it("handles 0.1-step rounding", () => {
    expect(roundToStep(0.37, 0.1)).toBeCloseTo(0.3, 5);
  });

  it("returns input when step is 0", () => {
    expect(roundToStep(1.5, 0)).toBe(1.5);
  });

  it("handles very small volumes", () => {
    expect(roundToStep(0.005, 0.01)).toBeCloseTo(0, 5);
  });
});

// ── clampVolume ───────────────────────────────────────────────────────────────

describe("clampVolume", () => {
  it("clamps below minimum", () => {
    expect(clampVolume(0.001, EURUSD)).toBe(0.01);
  });

  it("clamps above maximum", () => {
    expect(clampVolume(999, EURUSD)).toBe(500);
  });

  it("leaves valid volume unchanged", () => {
    expect(clampVolume(1.5, EURUSD)).toBe(1.5);
  });

  it("returns 0 for invalid spec (min > max)", () => {
    const bad: SymbolSpec = { ...EURUSD, volumeMin: 10, volumeMax: 5 };
    expect(clampVolume(1, bad)).toBe(0);
  });
});

// ── resolveSlDistance ─────────────────────────────────────────────────────────

describe("resolveSlDistance", () => {
  it("price unit: returns |entry - sl|", () => {
    expect(resolveSlDistance(1.0800, "price", 1.0850, EURUSD)).toBeCloseTo(0.005, 6);
  });

  it("price unit: works regardless of SL direction", () => {
    expect(resolveSlDistance(1.0900, "price", 1.0850, EURUSD)).toBeCloseTo(0.005, 6);
  });

  it("pips unit: 20 pips on EURUSD → 0.002", () => {
    // 20 * 10 * 0.00001 = 0.002
    expect(resolveSlDistance(20, "pips", 1.0850, EURUSD)).toBeCloseTo(0.002, 6);
  });

  it("pips unit: 20 pips on XAUUSD → 2.00", () => {
    // 20 * 10 * 0.01 = 2.0
    expect(resolveSlDistance(20, "pips", 2000, XAUUSD)).toBeCloseTo(2.0, 5);
  });

  it("percent unit: 1% of entry price", () => {
    expect(resolveSlDistance(1, "percent", 2000, XAUUSD)).toBeCloseTo(20, 5);
  });

  it("returns NaN for sl <= 0", () => {
    expect(resolveSlDistance(0, "pips", 1.0850, EURUSD)).toBeNaN();
  });

  it("returns NaN for invalid entry", () => {
    expect(resolveSlDistance(20, "pips", -1, EURUSD)).toBeNaN();
  });
});

// ── computeVolume ─────────────────────────────────────────────────────────────

describe("computeVolume — percent_balance", () => {
  it("computes correct volume for EURUSD 1% risk, 20 pip SL", () => {
    // valuePerLot = (0.002 / 0.00001) * 1.0 = 200
    // riskAmount = 10000 * 0.01 = 100
    // rawVolume = 100 / 200 = 0.5 lots
    const slDist = resolveSlDistance(20, "pips", 1.0850, EURUSD);
    const { volume, dollarRisk } = computeVolume({
      accountBalance: 10_000,
      slDistancePrice: slDist,
      settings: SETTINGS,
      spec: EURUSD,
    });
    expect(volume).toBeCloseTo(0.5, 2);
    expect(dollarRisk).toBeCloseTo(100, 1);
  });

  it("rounds down to volumeStep when result is not a clean multiple", () => {
    // riskAmount = 500 * 0.01 = 5; valuePerLot = 200; raw = 0.025 → step 0.01 → 0.02
    const slDist = resolveSlDistance(20, "pips", 1.0850, EURUSD);
    const { volume } = computeVolume({
      accountBalance: 500,
      slDistancePrice: slDist,
      settings: SETTINGS,
      spec: EURUSD,
    });
    expect(volume).toBeCloseTo(0.02, 5);
  });

  it("clamps to volumeMax when risk would exceed broker limit", () => {
    const slDist = resolveSlDistance(1, "pips", 1.0850, EURUSD); // 1 pip = tiny SL → huge lot
    const { volume } = computeVolume({
      accountBalance: 10_000_000,
      slDistancePrice: slDist,
      settings: { ...SETTINGS, riskPercent: 10 },
      spec: EURUSD,
    });
    expect(volume).toBe(EURUSD.volumeMax);
  });
});

describe("computeVolume — fixed_lot", () => {
  it("returns the exact fixed lot (after step/clamp)", () => {
    const slDist = resolveSlDistance(20, "pips", 1.0850, EURUSD);
    const { volume } = computeVolume({
      accountBalance: 10_000,
      slDistancePrice: slDist,
      settings: { ...SETTINGS, mode: "fixed_lot", fixedLot: 0.1 },
      spec: EURUSD,
    });
    expect(volume).toBeCloseTo(0.1, 5);
  });
});

describe("computeVolume — fixed_dollar_risk", () => {
  it("risks exactly $50 on EURUSD with 20-pip SL", () => {
    // valuePerLot = 200; volume = 50 / 200 = 0.25
    const slDist = resolveSlDistance(20, "pips", 1.0850, EURUSD);
    const { volume, dollarRisk } = computeVolume({
      accountBalance: 10_000,
      slDistancePrice: slDist,
      settings: { ...SETTINGS, mode: "fixed_dollar_risk", fixedDollarRisk: 50 },
      spec: EURUSD,
    });
    expect(volume).toBeCloseTo(0.25, 2);
    expect(dollarRisk).toBeCloseTo(50, 1);
  });
});

describe("computeVolume — edge cases", () => {
  it("returns volume=0 when slDistancePrice is 0", () => {
    const { volume } = computeVolume({
      accountBalance: 10_000,
      slDistancePrice: 0,
      settings: SETTINGS,
      spec: EURUSD,
    });
    expect(volume).toBe(0);
  });

  it("returns volume=0 when slDistancePrice is NaN", () => {
    const { volume } = computeVolume({
      accountBalance: 10_000,
      slDistancePrice: NaN,
      settings: SETTINGS,
      spec: EURUSD,
    });
    expect(volume).toBe(0);
  });
});

// ── gateAndSize ───────────────────────────────────────────────────────────────

describe("gateAndSize", () => {
  it("gates through with valid SL (price unit)", () => {
    const result = gateAndSize({
      sl: 1.0800,
      slUnit: "price",
      entryPrice: 1.0850,
      accountBalance: 10_000,
      settings: SETTINGS,
      spec: EURUSD,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.volume).toBeGreaterThan(0);
      expect(result.slPrice).toBe(1.0800);
    }
  });

  it("blocks when no SL and policy=skip", () => {
    const result = gateAndSize({
      sl: null,
      slUnit: "pips",
      entryPrice: 1.0850,
      accountBalance: 10_000,
      settings: { ...SETTINGS, defaultSlPolicy: "skip" },
      spec: EURUSD,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_sl:policy=skip");
  });

  it("blocks when no SL and policy=ask", () => {
    const result = gateAndSize({
      sl: null,
      slUnit: "pips",
      entryPrice: 1.0850,
      accountBalance: 10_000,
      settings: { ...SETTINGS, defaultSlPolicy: "ask" },
      spec: EURUSD,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_sl:policy=ask");
  });

  it("applies default SL when policy=apply_default", () => {
    const result = gateAndSize({
      sl: null,
      slUnit: "pips",
      entryPrice: 1.0850,
      accountBalance: 10_000,
      settings: { ...SETTINGS, defaultSlPolicy: "apply_default", defaultSlPips: 20 },
      spec: EURUSD,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.volume).toBeGreaterThan(0);
      expect(result.slPrice).toBeNull(); // no absolute SL price when using default pips
    }
  });

  it("blocks on invalid SL distance", () => {
    const result = gateAndSize({
      sl: -1,
      slUnit: "price",
      entryPrice: 1.0850,
      accountBalance: 10_000,
      settings: SETTINGS,
      spec: EURUSD,
    });
    expect(result.ok).toBe(false);
  });
});
