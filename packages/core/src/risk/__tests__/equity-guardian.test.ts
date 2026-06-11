import { describe, it, expect } from "vitest";
import { EquityGuardian } from "../equity-guardian";
import type { EquityGuardianConfig } from "../equity-guardian";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_CONFIG: EquityGuardianConfig = {
  dailyLossPct: 5,
  dailyLossBasis: "balance",
  maxDrawdownPct: 10,
  maxDrawdownModel: "static",
  challengeStartBalanceUsd: 10000,
  bufferPct: 0.5,
};

const T0 = Date.UTC(2026, 5, 11, 10, 0, 0); // 2026-06-11 10:00 UTC

function freshGuardian(config: EquityGuardianConfig = BASE_CONFIG) {
  return EquityGuardian.create(config, 10000, 10000, T0);
}

// ── ok decision ───────────────────────────────────────────────────────────────

describe("ok — equity well above floors", () => {
  it("returns ok when equity is at the starting level", () => {
    const g = freshGuardian();
    expect(g.onEquityTick({ equityUsd: 10000, balanceUsd: 10000, timestampMs: T0 }).action).toBe("ok");
  });

  it("returns ok after a small gain", () => {
    const g = freshGuardian();
    expect(g.onEquityTick({ equityUsd: 10200, balanceUsd: 10000, timestampMs: T0 }).action).toBe("ok");
  });
});

// ── pre_block — within buffer zone ───────────────────────────────────────────

describe("pre_block", () => {
  it("triggers when equity is within bufferPct of the effective floor", () => {
    const g = freshGuardian();
    // Effective floor = max(dailyLossFloor, drawdownFloor)
    // dailyLoss floor = 10000 × 0.95 = 9500; drawdown floor = 10000 × 0.90 = 9000
    // Effective = 9500; buffer = 10000 × 0.005 = 50
    // Pre-block zone: 9500 < equity ≤ 9550
    const result = g.onEquityTick({ equityUsd: 9530, balanceUsd: 10000, timestampMs: T0 });
    expect(result.action).toBe("pre_block");
    if (result.action === "pre_block") {
      expect(result.floorUsd).toBe(9500);
      expect(result.bufferRemainingUsd).toBeCloseTo(30, 0);
    }
  });

  it("reason string mentions the buffer", () => {
    const g = freshGuardian();
    const result = g.onEquityTick({ equityUsd: 9520, balanceUsd: 10000, timestampMs: T0 });
    expect(result.action).toBe("pre_block");
    if (result.action === "pre_block") {
      expect(result.reason).toMatch(/buffer/i);
    }
  });
});

// ── flatten_now — floor breached ──────────────────────────────────────────────

describe("flatten_now", () => {
  it("triggers when equity equals the floor exactly", () => {
    const g = freshGuardian();
    // Effective floor = 9500
    const result = g.onEquityTick({ equityUsd: 9500, balanceUsd: 10000, timestampMs: T0 });
    expect(result.action).toBe("flatten_now");
  });

  it("triggers when equity falls below the floor", () => {
    const g = freshGuardian();
    const result = g.onEquityTick({ equityUsd: 9400, balanceUsd: 10000, timestampMs: T0 });
    expect(result.action).toBe("flatten_now");
    if (result.action === "flatten_now") {
      expect(result.reason).toMatch(/floor/i);
    }
  });

  it("reports correct floor values in the decision", () => {
    const g = freshGuardian();
    const result = g.onEquityTick({ equityUsd: 9000, balanceUsd: 10000, timestampMs: T0 });
    if (result.action === "flatten_now") {
      expect(result.dailyLossFloorUsd).toBe(9500);
      expect(result.drawdownFloorUsd).toBe(9000);
      expect(result.floorUsd).toBe(9500); // daily loss is the more restrictive
    }
  });
});

// ── Day reset ─────────────────────────────────────────────────────────────────

describe("day reset", () => {
  it("resets dayStart when a new UTC day is detected", () => {
    const g = freshGuardian();
    // Simulate a big loss today
    g.onEquityTick({ equityUsd: 9550, balanceUsd: 9600, timestampMs: T0 });

    // Next day: equity and balance reset to new values
    const T1 = T0 + 24 * 60 * 60 * 1000; // +24h
    const result = g.onEquityTick({ equityUsd: 9600, balanceUsd: 9600, timestampMs: T1 });

    // Floor resets: new dayStartBalance = 9600 → dailyLoss floor = 9600 × 0.95 = 9120
    // drawdown floor = 10000 × 0.90 = 9000 (static, unchanged)
    // Effective = 9120; equity 9600 is well above → ok
    expect(result.action).toBe("ok");
  });
});

// ── Peak equity tracking ──────────────────────────────────────────────────────

describe("peakEquity tracking (intraday_trailing model)", () => {
  it("updates peak on a new high", () => {
    const config: EquityGuardianConfig = {
      ...BASE_CONFIG,
      maxDrawdownModel: "intraday_trailing",
      dailyLossPct: 1, // very tight daily loss to avoid it shadowing drawdown
    };
    const g = EquityGuardian.create(config, 10000, 10000, T0);

    // Equity rises to a new peak
    g.onEquityTick({ equityUsd: 11000, balanceUsd: 10000, timestampMs: T0 + 1000 });

    // Now peak = 11000; intraday floor = 11000 × 0.90 = 9900
    // daily loss floor = 10000 × (1 - 0.01) = 9900 (1% of 10000)
    // effective floor = max(9900, 9900) = 9900; buffer = 10000 × 0.005 = 50
    // Equity at 9960 (60 above floor, > buffer of 50) → ok
    const r1 = g.onEquityTick({ equityUsd: 9960, balanceUsd: 10000, timestampMs: T0 + 2000 });
    expect(r1.action).toBe("ok");

    // Equity at 9900 → flatten_now (exactly at floor)
    const r2 = g.onEquityTick({ equityUsd: 9900, balanceUsd: 10000, timestampMs: T0 + 4000 });
    expect(r2.action).toBe("flatten_now");
  });

  it("floor does not retreat when equity falls from peak", () => {
    const config: EquityGuardianConfig = {
      ...BASE_CONFIG,
      maxDrawdownModel: "intraday_trailing",
      dailyLossPct: 1,
    };
    const g = EquityGuardian.create(config, 10000, 10000, T0);
    g.onEquityTick({ equityUsd: 12000, balanceUsd: 10000, timestampMs: T0 + 1000 });

    const floors1 = g.getCurrentFloors();
    // Floor after peak = 12000 × 0.90 = 10800

    // Equity falls back
    g.onEquityTick({ equityUsd: 11000, balanceUsd: 10000, timestampMs: T0 + 2000 });
    const floors2 = g.getCurrentFloors();

    expect(floors2.drawdownFloorUsd).toBe(floors1.drawdownFloorUsd);
  });
});

// ── EOD snapshot ──────────────────────────────────────────────────────────────

describe("onEodSnapshot — eod_trailing model", () => {
  it("raises the EOD floor after a profitable day", () => {
    const config: EquityGuardianConfig = {
      ...BASE_CONFIG,
      maxDrawdownModel: "eod_trailing",
      dailyLossPct: 1,
    };
    const g = EquityGuardian.create(config, 10000, 10000, T0);

    // End of a profitable day: balance is now 10500
    g.onEodSnapshot(10500);

    // EOD floor = 10500 × 0.90 = 9450
    const floors = g.getCurrentFloors();
    expect(floors.drawdownFloorUsd).toBeCloseTo(9450, 1);
  });

  it("does not lower the EOD floor if balance drops below previous peak", () => {
    const config: EquityGuardianConfig = {
      ...BASE_CONFIG,
      maxDrawdownModel: "eod_trailing",
    };
    const g = EquityGuardian.create(config, 10000, 10000, T0);
    g.onEodSnapshot(11000); // peak = 11000
    g.onEodSnapshot(10500); // lower — should not update peak

    const floors = g.getCurrentFloors();
    expect(floors.drawdownFloorUsd).toBeCloseTo(9900, 1); // 11000 × 0.90
  });
});

// ── getState / serialize ──────────────────────────────────────────────────────

describe("getState", () => {
  it("round-trips through constructor", () => {
    const g1 = freshGuardian();
    g1.onEquityTick({ equityUsd: 10300, balanceUsd: 10100, timestampMs: T0 });
    const state = g1.getState();

    const g2 = new EquityGuardian(BASE_CONFIG, state);
    expect(g2.getCurrentFloors()).toEqual(g1.getCurrentFloors());
  });
});
