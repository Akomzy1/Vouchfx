/**
 * P2.14 hardening tests — coverage for scenarios not exercised by the primary
 * unit-test files.
 *
 * Covers:
 *   1. Equity guardian: drawdown floor controls (not daily-loss) in all three models.
 *   2. Equity guardian: flatten_now reason correctly attributes drawdown vs daily loss.
 *   3. Consistency throttle does NOT hard-block in evaluatePropRules (only pause does).
 *   4. Rule changes: only published (is_current) rulesets are enforced — verified by
 *      checking that evaluatePropRules only accepts the caller-supplied ruleset values;
 *      the caller (executor) is responsible for fetching the current published version.
 *   5. Audit trail reconstructability: PropGateResult.checks contains every rule with
 *      enough data to reconstruct the decision.
 */

import { describe, it, expect } from "vitest";
import { EquityGuardian } from "../equity-guardian";
import type { EquityGuardianConfig } from "../equity-guardian";
import { evaluatePropRules } from "../prop-gate";
import type { PropRuleset, PropAccountState } from "../prop-gate";
import { computeDrawdownFloor } from "../drawdown-tracker";

const T0 = Date.UTC(2026, 5, 14, 10, 0, 0); // 2026-06-14 10:00 UTC

// ── 1. Equity guardian: drawdown floor is the effective floor ─────────────────
// All existing equity-guardian tests use dailyLossPct=5, maxDrawdownPct=10 on a
// $10k account → daily floor $9500, drawdown floor $9000 → daily is tighter.
// Here we invert that: tight drawdown (2%) + loose daily loss (10%).

describe("equity guardian — drawdown floor controls (not daily-loss)", () => {
  const config: EquityGuardianConfig = {
    dailyLossPct: 10,          // daily floor = 10000 × 0.90 = 9000
    dailyLossBasis: "balance",
    maxDrawdownPct: 2,         // static floor = 10000 × 0.98 = 9800
    maxDrawdownModel: "static",
    challengeStartBalanceUsd: 10000,
    bufferPct: 0.3,            // buffer = 10000 × 0.003 = 30
  };

  function g() {
    return EquityGuardian.create(config, 10000, 10000, T0);
  }

  it("effective floor is the drawdown floor (9800) not the daily-loss floor (9000)", () => {
    const floors = g().getCurrentFloors();
    expect(floors.drawdownFloorUsd).toBe(9800);
    expect(floors.dailyLossFloorUsd).toBe(9000);
    expect(floors.effectiveFloorUsd).toBe(9800); // drawdown is more restrictive
  });

  it("flatten_now triggers at equity = 9800 (drawdown floor)", () => {
    const result = g().onEquityTick({ equityUsd: 9800, balanceUsd: 10000, timestampMs: T0 });
    expect(result.action).toBe("flatten_now");
  });

  it("flatten_now reason attributes the drawdown model", () => {
    const result = g().onEquityTick({ equityUsd: 9795, balanceUsd: 10000, timestampMs: T0 });
    if (result.action === "flatten_now") {
      expect(result.reason.toLowerCase()).toMatch(/drawdown/);
    } else {
      expect.fail("expected flatten_now");
    }
  });

  it("pre_block triggers when equity is within 30 USD of the drawdown floor", () => {
    // Buffer = 30; floor = 9800; pre_block zone: 9800 < equity ≤ 9830
    const result = g().onEquityTick({ equityUsd: 9820, balanceUsd: 10000, timestampMs: T0 });
    expect(result.action).toBe("pre_block");
    if (result.action === "pre_block") {
      expect(result.floorUsd).toBe(9800);
      expect(result.drawdownFloorUsd).toBe(9800);
    }
  });

  it("ok when equity is above the buffer zone (> 9830)", () => {
    const result = g().onEquityTick({ equityUsd: 9840, balanceUsd: 10000, timestampMs: T0 });
    expect(result.action).toBe("ok");
  });
});

// ── 2. EOD-trailing: flatten_now fires after EOD peak advances ────────────────

describe("equity guardian — eod_trailing flatten_now after peak advances", () => {
  const config: EquityGuardianConfig = {
    dailyLossPct: 1,           // loose daily floor so drawdown controls
    dailyLossBasis: "balance",
    maxDrawdownPct: 10,
    maxDrawdownModel: "eod_trailing",
    challengeStartBalanceUsd: 10000,
    bufferPct: 0.5,
  };

  it("flatten_now fires once EOD peak has raised the floor past current equity", () => {
    const guard = EquityGuardian.create(config, 10000, 10000, T0);

    // Good day: balance ends at 11000
    guard.onEodSnapshot(11000);
    // EOD floor is now 11000 × 0.90 = 9900

    // Next day: equity falls to 9900 (exactly at the EOD-trailing floor)
    const T1 = T0 + 25 * 60 * 60 * 1000;
    const result = guard.onEquityTick({ equityUsd: 9900, balanceUsd: 10000, timestampMs: T1 });
    expect(result.action).toBe("flatten_now");
    if (result.action === "flatten_now") {
      expect(result.drawdownFloorUsd).toBeCloseTo(9900, 1);
    }
  });

  it("floor does not drop if EOD snapshot is below peak", () => {
    const guard = EquityGuardian.create(config, 10000, 10000, T0);
    guard.onEodSnapshot(11000); // peak → 11000; floor = 9900
    guard.onEodSnapshot(10500); // lower than peak — should not update
    const floors = guard.getCurrentFloors();
    expect(floors.drawdownFloorUsd).toBeCloseTo(9900, 1); // still 11000 × 0.90
  });
});

// ── 3. Intraday-trailing: floor stays raised after equity retreats ────────────

describe("equity guardian — intraday_trailing floor is sticky", () => {
  const config: EquityGuardianConfig = {
    dailyLossPct: 1,
    dailyLossBasis: "balance",
    maxDrawdownPct: 5,
    maxDrawdownModel: "intraday_trailing",
    challengeStartBalanceUsd: 10000,
    bufferPct: 0.5,
  };

  it("flatten_now fires based on the historical peak, not the current level", () => {
    const guard = EquityGuardian.create(config, 10000, 10000, T0);

    // Equity spikes to 12000 → intraday floor = 12000 × 0.95 = 11400
    guard.onEquityTick({ equityUsd: 12000, balanceUsd: 10000, timestampMs: T0 + 1000 });

    // Equity then falls to 11400 — should trigger flatten_now
    const result = guard.onEquityTick({ equityUsd: 11400, balanceUsd: 10000, timestampMs: T0 + 2000 });
    expect(result.action).toBe("flatten_now");
    if (result.action === "flatten_now") {
      expect(result.drawdownFloorUsd).toBeCloseTo(11400, 0);
    }
  });

  it("computeDrawdownFloor returns the correct intraday floor for a given peak", () => {
    expect(
      computeDrawdownFloor("intraday_trailing", {
        challengeStartBalanceUsd: 10000,
        peakEquityUsd: 12000,
        eodPeakBalanceUsd: 10000,
        maxDrawdownPct: 5,
      })
    ).toBeCloseTo(11400, 0); // 12000 × 0.95
  });
});

// ── 4. Consistency throttle does NOT hard-block in evaluatePropRules ──────────
// The consistency *manager* surfaces a "throttle" warning in the UI, but the
// gate only blocks when today's profit >= the cap. Approaching the cap (but not
// reaching it) must remain a pass so the executor doesn't over-block.

describe("prop-gate: consistency throttle is not a hard block", () => {
  const ruleset: PropRuleset = {
    dailyLossPct: 5,
    dailyLossBasis: "balance",
    maxDrawdownPct: 10,
    maxDrawdownModel: "static",
    consistencyPct: 30,
    weekendHoldingAllowed: false,
    copyTradingPermitted: true,
  };

  const baseState: PropAccountState = {
    currentEquityUsd: 10000,
    currentBalanceUsd: 10000,
    dayStartEquityUsd: 10000,
    dayStartBalanceUsd: 10000,
    challengeStartBalanceUsd: 10000,
    peakEquityUsd: 10000,
    eodPeakBalanceUsd: 10000,
    periodTotalProfitUsd: 1000,
    todayProfitUsd: 0,
    inNewsWindow: false,
    isWeekendRisk: false,
  };

  it("passes when todayProfit is at 98% of cap (approaching but not reached)", () => {
    // Cap = 1000 × 0.30 = 300; todayProfit = 294 (98%) → passes
    const r = evaluatePropRules(ruleset, { ...baseState, todayProfitUsd: 294 });
    const check = r.checks.find((c) => c.rule === "consistency");
    expect(check?.passed).toBe(true);
    expect(r.passed).toBe(true);
  });

  it("blocks when todayProfit exactly equals the cap", () => {
    // 300 >= 300 → blocked
    const r = evaluatePropRules(ruleset, { ...baseState, todayProfitUsd: 300 });
    const check = r.checks.find((c) => c.rule === "consistency");
    expect(check?.passed).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("blocks when todayProfit exceeds the cap by a fraction", () => {
    const r = evaluatePropRules(ruleset, { ...baseState, todayProfitUsd: 300.01 });
    expect(r.passed).toBe(false);
  });
});

// ── 5. Audit-trail reconstructability ────────────────────────────────────────
// Every blocking decision must be reconstructable: the checks array must include
// the rule id, current value, limit, and reason for every evaluated rule.
// This verifies the executor has enough information to write a complete audit row.

describe("PropGateResult audit trail completeness", () => {
  const ruleset: PropRuleset = {
    dailyLossPct: 5,
    dailyLossBasis: "equity",
    maxDrawdownPct: 10,
    maxDrawdownModel: "static",
    consistencyPct: 30,
    weekendHoldingAllowed: false,
    copyTradingPermitted: true,
  };

  const fullState: PropAccountState = {
    currentEquityUsd: 10000,
    currentBalanceUsd: 10000,
    dayStartEquityUsd: 10000,
    dayStartBalanceUsd: 10000,
    challengeStartBalanceUsd: 10000,
    peakEquityUsd: 10000,
    eodPeakBalanceUsd: 10000,
    periodTotalProfitUsd: 1000,
    todayProfitUsd: 100,
    inNewsWindow: false,
    isWeekendRisk: false,
  };

  it("every check has a non-null rule identifier", () => {
    const r = evaluatePropRules(ruleset, fullState);
    for (const c of r.checks) {
      expect(c.rule).toBeTruthy();
    }
  });

  it("every check has a limit value (or null for boolean rules)", () => {
    const r = evaluatePropRules(ruleset, fullState);
    // Numeric rules have non-null limits
    const dailyLoss = r.checks.find((c) => c.rule === "daily_loss");
    const drawdown  = r.checks.find((c) => c.rule === "max_drawdown");
    const consistency = r.checks.find((c) => c.rule === "consistency");
    expect(dailyLoss?.limit).toBe(5);
    expect(drawdown?.limit).toBe(10);
    expect(consistency?.limit).not.toBeNull();
  });

  it("failing checks always have a non-null reason string", () => {
    const brokenRuleset: PropRuleset = {
      ...ruleset,
      dailyLossPct: 1, // will fail — 0% loss of dayStartEquity is technically 0 < 1 → hmm
      copyTradingPermitted: false,
    };
    const r = evaluatePropRules(brokenRuleset, fullState);
    for (const c of r.checks.filter((c) => !c.passed)) {
      expect(c.reason).toBeTruthy();
      expect(typeof c.reason).toBe("string");
    }
  });

  it("blockingReason is null when all rules pass", () => {
    const r = evaluatePropRules(ruleset, fullState);
    expect(r.blockingReason).toBeNull();
    expect(r.passed).toBe(true);
  });

  it("blockingReason matches the first failing check's reason exactly", () => {
    const r = evaluatePropRules(
      { ...ruleset, copyTradingPermitted: false },
      fullState,
    );
    const firstFail = r.checks.find((c) => !c.passed);
    expect(r.blockingReason).toBe(firstFail?.reason);
  });

  it("checks array includes every evaluated rule (min 5 mandatory rules)", () => {
    const r = evaluatePropRules(ruleset, fullState);
    const ruleIds = r.checks.map((c) => c.rule);
    expect(ruleIds).toContain("copy_trading_permitted");
    expect(ruleIds).toContain("daily_loss");
    expect(ruleIds).toContain("max_drawdown");
    expect(ruleIds).toContain("news_window");
    expect(ruleIds).toContain("weekend_holding");
    // consistency is included because consistencyPct is set and periodTotalProfit > 0
    expect(ruleIds).toContain("consistency");
  });
});

// ── 6. Published-version enforcement (pure-logic assertion) ───────────────────
// The executor fetches the is_current=true ruleset from the DB before calling
// evaluatePropRules. The gate itself is a pure function — it trusts the caller
// to supply the published version. This test verifies that the gate produces
// DIFFERENT results for different ruleset versions (old vs new) to confirm that
// fetching the wrong version would be detectable.

describe("gate produces different results for different ruleset versions", () => {
  const state: PropAccountState = {
    currentEquityUsd: 9650,
    currentBalanceUsd: 9700,
    dayStartEquityUsd: 10000,
    dayStartBalanceUsd: 10000,
    challengeStartBalanceUsd: 10000,
    peakEquityUsd: 10000,
    eodPeakBalanceUsd: 10000,
    periodTotalProfitUsd: 0,
    todayProfitUsd: 0,
    inNewsWindow: false,
    isWeekendRisk: false,
  };

  const oldRuleset: PropRuleset = {
    dailyLossPct: 5,
    dailyLossBasis: "balance",
    maxDrawdownPct: 10,
    maxDrawdownModel: "static",
    consistencyPct: null,
    weekendHoldingAllowed: false,
    copyTradingPermitted: true,
  };

  const newRuleset: PropRuleset = {
    ...oldRuleset,
    dailyLossPct: 3, // rule tightened in a new version
  };

  it("old ruleset (5% daily loss) passes for 3.5% loss", () => {
    // 3.5% loss of 10000 dayStart
    const r = evaluatePropRules(oldRuleset, state);
    const check = r.checks.find((c) => c.rule === "daily_loss");
    expect(check?.passed).toBe(true);
  });

  it("new ruleset (3% daily loss) blocks the same 3.5% loss", () => {
    const r = evaluatePropRules(newRuleset, state);
    const check = r.checks.find((c) => c.rule === "daily_loss");
    expect(check?.passed).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("executor using stale ruleset would allow what the current version blocks", () => {
    const withOld = evaluatePropRules(oldRuleset, state);
    const withNew = evaluatePropRules(newRuleset, state);
    // Verifies that the version fetched matters — not interchangeable
    expect(withOld.passed).not.toBe(withNew.passed);
  });
});
