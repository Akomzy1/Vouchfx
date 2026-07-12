import { describe, it, expect } from "vitest";
import { roundToStep, clampVolume, computeVolume } from "../sizing";
import { resolveSlDistance } from "../sl-resolve";
import { gateAndSize, isCryptoSymbol, CRYPTO_DEFAULT_SL_PERCENT } from "../gate";
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

const BTCUSD: SymbolSpec = {
  symbol: "BTCUSD",
  contractSize: 1,
  tickSize: 0.01,
  tickValue: 0.01,   // USD per 1-cent tick per 1 lot (1 BTC)
  volumeStep: 0.01,
  volumeMin: 0.01,
  volumeMax: 200,
  digits: 2,
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
      side: "BUY",
      symbol: "EURUSD",
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
      side: "BUY",
      symbol: "EURUSD",
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
      side: "BUY",
      symbol: "EURUSD",
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
      side: "BUY",
      symbol: "EURUSD",
      entryPrice: 1.0850,
      accountBalance: 10_000,
      settings: { ...SETTINGS, defaultSlPolicy: "apply_default", defaultSlPips: 20 },
      spec: EURUSD,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.volume).toBeGreaterThan(0);
      // apply_default now returns an ABSOLUTE SL price: entry - 20pips (BUY).
      // 20 * 10 * 0.00001 = 0.002 → 1.0850 - 0.002 = 1.0830.
      expect(result.slPrice).toBeCloseTo(1.0830, 5);
    }
  });

  it("blocks on invalid SL distance", () => {
    const result = gateAndSize({
      sl: -1,
      slUnit: "price",
      side: "BUY",
      symbol: "EURUSD",
      entryPrice: 1.0850,
      accountBalance: 10_000,
      settings: SETTINGS,
      spec: EURUSD,
    });
    expect(result.ok).toBe(false);
  });
});

// ── gateAndSize — crypto default SL ───────────────────────────────────────────
// Regression: a no-SL BTCUSD signal with apply_default used the 20-PIP forex
// default → $0.20 SL distance on BTC. The broker rejected the stop ("Invalid
// stops in the request") and the near-zero distance sized the volume up to the
// broker's 200-lot max. Crypto defaults must be percent-of-price.

describe("gateAndSize — crypto default SL", () => {
  it("detects crypto symbols, including broker-suffixed ones", () => {
    expect(isCryptoSymbol("BTCUSD")).toBe(true);
    expect(isCryptoSymbol("BTCUSDm")).toBe(true);
    expect(isCryptoSymbol("XBTUSD")).toBe(true);
    expect(isCryptoSymbol("ETHUSD")).toBe(true);
    expect(isCryptoSymbol("EURUSD")).toBe(false);
    expect(isCryptoSymbol("XAUUSD")).toBe(false);
    expect(isCryptoSymbol("US100")).toBe(false);
  });

  it("applies a percent-of-price default SL on BTCUSD (not pips)", () => {
    const entry = 118_000;
    const result = gateAndSize({
      sl: null,
      slUnit: "pips",
      side: "BUY",
      symbol: "BTCUSD",
      entryPrice: entry,
      accountBalance: 10_000,
      settings: { ...SETTINGS, defaultSlPolicy: "apply_default", defaultSlPips: 20 },
      spec: BTCUSD,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const expectedDist = entry * (CRYPTO_DEFAULT_SL_PERCENT / 100); // 1,180
      expect(result.slPrice).toBeCloseTo(entry - expectedDist, 2);
      // The 20-pip bug put the SL $0.20 below entry — assert we are far from it.
      expect(entry - result.slPrice!).toBeGreaterThan(100);
    }
  });

  it("sizes a sane volume from the percent default (not the broker max-lot cap)", () => {
    const entry = 118_000;
    const result = gateAndSize({
      sl: null,
      slUnit: "pips",
      side: "BUY",
      symbol: "BTCUSD",
      entryPrice: entry,
      accountBalance: 10_000,
      settings: { ...SETTINGS, defaultSlPolicy: "apply_default" },
      spec: BTCUSD,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // riskAmount = $100; valuePerLot = (1180 / 0.01) * 0.01 = $1,180/lot
      // → 0.08 lots after step rounding. The pip bug produced 200 lots.
      expect(result.volume).toBeCloseTo(0.08, 2);
      expect(result.volume).toBeLessThan(1);
      expect(result.dollarRisk).toBeLessThanOrEqual(100);
    }
  });

  it("places the crypto default SL above entry for SELL", () => {
    const entry = 118_000;
    const result = gateAndSize({
      sl: null,
      slUnit: "pips",
      side: "SELL",
      symbol: "BTCUSD",
      entryPrice: entry,
      accountBalance: 10_000,
      settings: { ...SETTINGS, defaultSlPolicy: "apply_default" },
      spec: BTCUSD,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.slPrice!).toBeGreaterThan(entry);
    }
  });

  it("leaves an explicit crypto SL untouched (no default substitution)", () => {
    const result = gateAndSize({
      sl: 116_000,
      slUnit: "price",
      side: "BUY",
      symbol: "BTCUSD",
      entryPrice: 118_000,
      accountBalance: 10_000,
      settings: { ...SETTINGS, defaultSlPolicy: "apply_default" },
      spec: BTCUSD,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.slPrice).toBe(116_000);
  });
});
