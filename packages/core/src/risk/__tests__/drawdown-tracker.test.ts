import { describe, it, expect } from "vitest";
import {
  computeDrawdownFloor,
  computeDailyLossFloor,
  computeEffectiveFloor,
  buildDrawdownStatus,
} from "../drawdown-tracker";

// ── computeDrawdownFloor ──────────────────────────────────────────────────────

describe("computeDrawdownFloor — static", () => {
  const base = {
    challengeStartBalanceUsd: 10000,
    peakEquityUsd: 12000,
    eodPeakBalanceUsd: 11000,
    maxDrawdownPct: 10,
  };

  it("floor = challengeStart × (1 - pct)", () => {
    expect(computeDrawdownFloor("static", base)).toBe(9000);
  });

  it("floor does not change when account grows (static anchor)", () => {
    expect(
      computeDrawdownFloor("static", { ...base, peakEquityUsd: 15000, eodPeakBalanceUsd: 14000 }),
    ).toBe(9000);
  });

  it("5% drawdown on 100k account", () => {
    expect(
      computeDrawdownFloor("static", { ...base, challengeStartBalanceUsd: 100000, maxDrawdownPct: 5 }),
    ).toBe(95000);
  });
});

describe("computeDrawdownFloor — eod_trailing", () => {
  it("floor trails the highest EOD balance", () => {
    expect(
      computeDrawdownFloor("eod_trailing", {
        challengeStartBalanceUsd: 10000,
        peakEquityUsd: 12000,       // ignored
        eodPeakBalanceUsd: 11000,
        maxDrawdownPct: 10,
      }),
    ).toBe(9900); // 11000 × 0.90
  });

  it("floor rises when EOD peak rises", () => {
    const base = { challengeStartBalanceUsd: 10000, peakEquityUsd: 10000, maxDrawdownPct: 10 };
    expect(computeDrawdownFloor("eod_trailing", { ...base, eodPeakBalanceUsd: 10000 })).toBe(9000);
    expect(computeDrawdownFloor("eod_trailing", { ...base, eodPeakBalanceUsd: 10500 })).toBe(9450);
    expect(computeDrawdownFloor("eod_trailing", { ...base, eodPeakBalanceUsd: 11000 })).toBe(9900);
  });

  it("floor never falls when EOD peak only grows", () => {
    const base = { challengeStartBalanceUsd: 10000, peakEquityUsd: 10000, maxDrawdownPct: 5 };
    const f1 = computeDrawdownFloor("eod_trailing", { ...base, eodPeakBalanceUsd: 10000 });
    const f2 = computeDrawdownFloor("eod_trailing", { ...base, eodPeakBalanceUsd: 11000 });
    expect(f2).toBeGreaterThan(f1);
  });
});

describe("computeDrawdownFloor — intraday_trailing", () => {
  it("floor trails the highest intraday equity tick", () => {
    expect(
      computeDrawdownFloor("intraday_trailing", {
        challengeStartBalanceUsd: 10000,
        peakEquityUsd: 11500,
        eodPeakBalanceUsd: 10000, // ignored
        maxDrawdownPct: 10,
      }),
    ).toBeCloseTo(10350, 1); // 11500 × 0.90
  });

  it("floor rises with each new equity high", () => {
    const base = { challengeStartBalanceUsd: 10000, eodPeakBalanceUsd: 10000, maxDrawdownPct: 5 };
    expect(computeDrawdownFloor("intraday_trailing", { ...base, peakEquityUsd: 10000 })).toBe(9500);
    expect(computeDrawdownFloor("intraday_trailing", { ...base, peakEquityUsd: 10500 })).toBeCloseTo(9975, 1);
    expect(computeDrawdownFloor("intraday_trailing", { ...base, peakEquityUsd: 11000 })).toBeCloseTo(10450, 1);
  });

  it("floor never falls (trailing model)", () => {
    const base = { challengeStartBalanceUsd: 10000, eodPeakBalanceUsd: 10000, maxDrawdownPct: 10 };
    const peakFloor = computeDrawdownFloor("intraday_trailing", { ...base, peakEquityUsd: 12000 });
    // Even if current equity is back to 10k, peak floor stays
    expect(peakFloor).toBe(10800); // 12000 × 0.90
  });
});

// ── computeDailyLossFloor ─────────────────────────────────────────────────────

describe("computeDailyLossFloor", () => {
  const params = {
    dayStartEquityUsd: 10200,
    dayStartBalanceUsd: 10000,
    dailyLossPct: 5,
  };

  it("equity basis: uses dayStartEquity as reference", () => {
    expect(computeDailyLossFloor("equity", params)).toBeCloseTo(9690, 1); // 10200 × 0.95
  });

  it("balance basis: uses dayStartBalance as reference", () => {
    expect(computeDailyLossFloor("balance", params)).toBe(9500); // 10000 × 0.95
  });

  it("4% daily loss on account that had a good day yesterday", () => {
    expect(
      computeDailyLossFloor("balance", {
        ...params,
        dayStartBalanceUsd: 10500,
        dailyLossPct: 4,
      }),
    ).toBeCloseTo(10080, 1); // 10500 × 0.96
  });
});

// ── computeEffectiveFloor ─────────────────────────────────────────────────────

describe("computeEffectiveFloor", () => {
  it("returns the higher of the two floors (more restrictive)", () => {
    expect(computeEffectiveFloor(9500, 9000)).toBe(9500);
    expect(computeEffectiveFloor(9000, 9500)).toBe(9500);
  });

  it("returns the same value when floors are equal", () => {
    expect(computeEffectiveFloor(9000, 9000)).toBe(9000);
  });
});

// ── buildDrawdownStatus ───────────────────────────────────────────────────────

describe("buildDrawdownStatus", () => {
  it("computes percentages relative to challengeStart", () => {
    const s = buildDrawdownStatus({
      model: "static",
      challengeStartBalanceUsd: 10000,
      currentEquityUsd: 9500,
      drawdownFloorUsd: 9000,
      dailyLossFloorUsd: 9500,
    });
    expect(s.effectiveFloorUsd).toBe(9500); // daily loss is higher
    expect(s.currentEquityPct).toBeCloseTo(95, 1);
    expect(s.floorPct).toBeCloseTo(95, 1);
    expect(s.headroomPct).toBeCloseTo(0, 1);
  });

  it("breached = true when equity <= effectiveFloor", () => {
    const s = buildDrawdownStatus({
      model: "static",
      challengeStartBalanceUsd: 10000,
      currentEquityUsd: 8999,
      drawdownFloorUsd: 9000,
      dailyLossFloorUsd: 8500,
    });
    expect(s.breached).toBe(true);
  });

  it("breached = false when equity > effectiveFloor", () => {
    const s = buildDrawdownStatus({
      model: "static",
      challengeStartBalanceUsd: 10000,
      currentEquityUsd: 9001,
      drawdownFloorUsd: 9000,
      dailyLossFloorUsd: 8500,
    });
    expect(s.breached).toBe(false);
  });
});
