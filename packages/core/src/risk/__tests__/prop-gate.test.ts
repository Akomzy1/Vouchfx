import { describe, it, expect } from "vitest";
import { evaluatePropRules } from "../prop-gate";
import type { PropRuleset, PropAccountState } from "../prop-gate";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_RULESET: PropRuleset = {
  dailyLossPct: 5,
  dailyLossBasis: "balance",
  maxDrawdownPct: 10,
  maxDrawdownModel: "static",
  consistencyPct: null,
  weekendHoldingAllowed: false,
  copyTradingPermitted: true,
};

const BASE_STATE: PropAccountState = {
  currentEquityUsd: 10000,
  currentBalanceUsd: 10000,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function check(result: ReturnType<typeof evaluatePropRules>, rule: string) {
  return result.checks.find((c) => c.rule === rule);
}

// ── Copy-trading permission ───────────────────────────────────────────────────

describe("copy_trading_permitted", () => {
  it("passes when copy trading is permitted", () => {
    const r = evaluatePropRules(BASE_RULESET, BASE_STATE);
    expect(check(r, "copy_trading_permitted")?.passed).toBe(true);
  });

  it("blocks when copy trading is not permitted", () => {
    const r = evaluatePropRules(
      { ...BASE_RULESET, copyTradingPermitted: false },
      BASE_STATE,
    );
    expect(r.passed).toBe(false);
    expect(check(r, "copy_trading_permitted")?.passed).toBe(false);
    expect(r.blockingReason).toMatch(/TOS breach/i);
  });
});

// ── Daily loss ────────────────────────────────────────────────────────────────

describe("daily_loss — balance basis", () => {
  it("passes when no loss today", () => {
    const r = evaluatePropRules(BASE_RULESET, BASE_STATE);
    expect(check(r, "daily_loss")?.passed).toBe(true);
    expect(check(r, "daily_loss")?.current).toBe(0);
  });

  it("passes when loss is below the limit", () => {
    const state = { ...BASE_STATE, currentEquityUsd: 9550 }; // 4.5% loss
    const r = evaluatePropRules(BASE_RULESET, state);
    expect(check(r, "daily_loss")?.passed).toBe(true);
  });

  it("fails when loss equals the limit", () => {
    const state = { ...BASE_STATE, currentEquityUsd: 9500 }; // exactly 5%
    const r = evaluatePropRules(BASE_RULESET, state);
    expect(r.passed).toBe(false);
    expect(check(r, "daily_loss")?.passed).toBe(false);
  });

  it("fails when loss exceeds the limit", () => {
    const state = { ...BASE_STATE, currentEquityUsd: 9400 }; // 6%
    const r = evaluatePropRules(BASE_RULESET, state);
    expect(check(r, "daily_loss")?.passed).toBe(false);
    expect(check(r, "daily_loss")?.current).toBe(6);
  });

  it("uses dayStartBalance (not challengeStart) as basis", () => {
    // Day started at 10500, now at 10000 → 4.76% loss of dayStart
    const state: PropAccountState = {
      ...BASE_STATE,
      dayStartBalanceUsd: 10500,
      challengeStartBalanceUsd: 10000,
      currentEquityUsd: 10000,
    };
    const r = evaluatePropRules(BASE_RULESET, state);
    // 500 / 10500 = 4.76% < 5% → pass
    expect(check(r, "daily_loss")?.passed).toBe(true);
  });
});

describe("daily_loss — equity basis", () => {
  it("uses dayStartEquity as the daily-loss floor reference", () => {
    const ruleset = { ...BASE_RULESET, dailyLossBasis: "equity" as const };
    const state = {
      ...BASE_STATE,
      dayStartEquityUsd: 10200,
      currentEquityUsd: 9680, // loss of 520 = 5.1% of 10200 → over 5% limit
    };
    const r = evaluatePropRules(ruleset, state);
    expect(check(r, "daily_loss")?.passed).toBe(false);
  });
});

// ── Max drawdown ──────────────────────────────────────────────────────────────

describe("max_drawdown — static model", () => {
  it("passes when equity is above the floor", () => {
    const r = evaluatePropRules(BASE_RULESET, BASE_STATE);
    expect(check(r, "max_drawdown")?.passed).toBe(true);
  });

  it("fails when equity falls below static floor (challengeStart × (1 - pct))", () => {
    // Floor = 10000 × 0.90 = 9000.
    // Set dayStart close to currentEquity so daily loss < 5% (passes),
    // but cumulative drawdown from challengeStart puts equity below floor.
    const state: PropAccountState = {
      ...BASE_STATE,
      challengeStartBalanceUsd: 10000,
      dayStartBalanceUsd: 9050,  // daily loss = (9050-8999)/9050 = 0.56% < 5% → passes
      dayStartEquityUsd: 9050,
      currentEquityUsd: 8999,    // < floor 9000 → drawdown fails
    };
    const r = evaluatePropRules(BASE_RULESET, state);
    expect(check(r, "max_drawdown")?.passed).toBe(false);
    expect(check(r, "max_drawdown")?.reason).toMatch(/floor/i);
  });

  it("passes when equity exactly equals floor + 1 cent", () => {
    const state = { ...BASE_STATE, currentEquityUsd: 9000.01 };
    const r = evaluatePropRules(BASE_RULESET, state);
    expect(check(r, "max_drawdown")?.passed).toBe(true);
  });
});

describe("max_drawdown — eod_trailing model", () => {
  it("uses eodPeakBalance as the trailing reference", () => {
    const ruleset = { ...BASE_RULESET, maxDrawdownModel: "eod_trailing" as const };
    const state = {
      ...BASE_STATE,
      eodPeakBalanceUsd: 11000,       // peaked at 11k end-of-day
      currentEquityUsd: 9850,         // floor = 11000 × 0.90 = 9900; 9850 < 9900 → fail
    };
    const r = evaluatePropRules(ruleset, state);
    expect(check(r, "max_drawdown")?.passed).toBe(false);
  });

  it("passes when equity is above the EOD-trailing floor", () => {
    const ruleset = { ...BASE_RULESET, maxDrawdownModel: "eod_trailing" as const };
    const state = {
      ...BASE_STATE,
      eodPeakBalanceUsd: 11000,
      currentEquityUsd: 9950,         // floor = 9900; 9950 > 9900 → pass
    };
    const r = evaluatePropRules(ruleset, state);
    expect(check(r, "max_drawdown")?.passed).toBe(true);
  });
});

describe("max_drawdown — intraday_trailing model", () => {
  it("uses peakEquity as the intraday reference", () => {
    const ruleset = { ...BASE_RULESET, maxDrawdownModel: "intraday_trailing" as const };
    const state = {
      ...BASE_STATE,
      peakEquityUsd: 12000,           // intraday peak 12k
      currentEquityUsd: 10700,        // floor = 12000 × 0.90 = 10800; 10700 < 10800 → fail
    };
    const r = evaluatePropRules(ruleset, state);
    expect(check(r, "max_drawdown")?.passed).toBe(false);
  });
});

// ── Consistency ───────────────────────────────────────────────────────────────

describe("consistency", () => {
  it("skips the check when consistencyPct is null", () => {
    const r = evaluatePropRules(BASE_RULESET, BASE_STATE);
    expect(check(r, "consistency")).toBeUndefined();
  });

  it("skips the check when periodTotalProfit is 0 (no profit yet)", () => {
    const ruleset = { ...BASE_RULESET, consistencyPct: 30 };
    const r = evaluatePropRules(ruleset, BASE_STATE);
    expect(check(r, "consistency")).toBeUndefined();
  });

  it("passes when today's profit is below the cap", () => {
    const ruleset = { ...BASE_RULESET, consistencyPct: 30 };
    const state = {
      ...BASE_STATE,
      periodTotalProfitUsd: 1000,
      todayProfitUsd: 280,     // cap = 300; 280 < 300 → pass
    };
    const r = evaluatePropRules(ruleset, state);
    expect(check(r, "consistency")?.passed).toBe(true);
  });

  it("fails when today's profit equals or exceeds the cap", () => {
    const ruleset = { ...BASE_RULESET, consistencyPct: 30 };
    const state = {
      ...BASE_STATE,
      periodTotalProfitUsd: 1000,
      todayProfitUsd: 300,     // exactly at 30% cap → fail
    };
    const r = evaluatePropRules(ruleset, state);
    expect(r.passed).toBe(false);
    expect(check(r, "consistency")?.passed).toBe(false);
    expect(r.blockingReason).toMatch(/consistency cap/i);
  });
});

// ── News window ───────────────────────────────────────────────────────────────

describe("news_window", () => {
  it("passes when not in a news window", () => {
    const r = evaluatePropRules(BASE_RULESET, { ...BASE_STATE, inNewsWindow: false });
    expect(check(r, "news_window")?.passed).toBe(true);
  });

  it("fails when inside the firm's news window", () => {
    const r = evaluatePropRules(BASE_RULESET, { ...BASE_STATE, inNewsWindow: true });
    expect(r.passed).toBe(false);
    expect(check(r, "news_window")?.passed).toBe(false);
    expect(r.blockingReason).toMatch(/news exclusion window/i);
  });
});

// ── Weekend holding ───────────────────────────────────────────────────────────

describe("weekend_holding", () => {
  it("passes when weekend risk is false", () => {
    const r = evaluatePropRules(BASE_RULESET, { ...BASE_STATE, isWeekendRisk: false });
    expect(check(r, "weekend_holding")?.passed).toBe(true);
  });

  it("passes when weekend risk but firm allows holding", () => {
    const ruleset = { ...BASE_RULESET, weekendHoldingAllowed: true };
    const r = evaluatePropRules(ruleset, { ...BASE_STATE, isWeekendRisk: true });
    expect(check(r, "weekend_holding")?.passed).toBe(true);
  });

  it("fails when weekend risk and firm bans holding", () => {
    const r = evaluatePropRules(BASE_RULESET, { ...BASE_STATE, isWeekendRisk: true });
    expect(r.passed).toBe(false);
    expect(check(r, "weekend_holding")?.passed).toBe(false);
    expect(r.blockingReason).toMatch(/weekend/i);
  });
});

// ── blockingReason + first-failure ordering ───────────────────────────────────

describe("PropGateResult structure", () => {
  it("reports passed=true and null blockingReason when all rules pass", () => {
    const r = evaluatePropRules(BASE_RULESET, BASE_STATE);
    expect(r.passed).toBe(true);
    expect(r.blockingReason).toBeNull();
    expect(r.checks.every((c) => c.passed)).toBe(true);
  });

  it("blockingReason is the FIRST failing rule's reason", () => {
    // Copy_trading fails first, then daily_loss would also fail
    const ruleset: PropRuleset = {
      ...BASE_RULESET,
      copyTradingPermitted: false,
      dailyLossPct: 1,
    };
    const state = { ...BASE_STATE, currentEquityUsd: 9500 }; // 5% loss > 1% limit
    const r = evaluatePropRules(ruleset, state);
    expect(r.blockingReason).toMatch(/TOS breach/i); // copy_trading checked first
  });
});
