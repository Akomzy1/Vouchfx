import { describe, it, expect } from "vitest";
import {
  computeConsistencyStatus,
  consistencyBlockReason,
} from "../consistency-manager";
import type { DailyPnlEntry } from "../consistency-manager";

const TODAY = "2026-06-11";

function days(entries: [string, number][]): DailyPnlEntry[] {
  return entries.map(([dayKey, realizedPnlUsd]) => ({ dayKey, realizedPnlUsd }));
}

// ── No profit yet ─────────────────────────────────────────────────────────────

describe("no period profit yet", () => {
  it("returns ok when there are no profit days", () => {
    const s = computeConsistencyStatus({ consistencyPct: 30 }, TODAY, []);
    expect(s.action).toBe("ok");
    expect(s.periodTotalProfitUsd).toBe(0);
    expect(s.dailyCapUsd).toBe(0);
  });

  it("returns ok when all days are losses", () => {
    const s = computeConsistencyStatus(
      { consistencyPct: 30 },
      TODAY,
      days([["2026-06-09", -100], ["2026-06-10", -50]]),
    );
    expect(s.action).toBe("ok");
  });
});

// ── ok — well below cap ───────────────────────────────────────────────────────

describe("ok — today is well below cap", () => {
  it("passes when today's profit is less than 85% of the cap", () => {
    // Period total profit = 1000; cap = 300 (30%); today = 200 (66.7%) → ok
    const s = computeConsistencyStatus(
      { consistencyPct: 30 },
      TODAY,
      days([
        ["2026-06-09", 500],
        ["2026-06-10", 500],
        [TODAY, 200],
      ]),
    );
    expect(s.action).toBe("ok");
    expect(s.dailyCapUsd).toBe(300);
    expect(s.utilizationPct).toBeCloseTo(66.67, 1);
    expect(s.remainingUsd).toBeCloseTo(100, 0);
  });
});

// ── throttle — approaching cap ────────────────────────────────────────────────

describe("throttle — approaching the cap", () => {
  it("throttles when today >= 85% of cap (default threshold)", () => {
    // Period = 1000; cap = 300; today = 260 = 86.7% → throttle
    const s = computeConsistencyStatus(
      { consistencyPct: 30 },
      TODAY,
      days([
        ["2026-06-09", 500],
        ["2026-06-10", 500],
        [TODAY, 260],
      ]),
    );
    expect(s.action).toBe("throttle");
    expect(s.reason).toMatch(/throttl/i);
  });

  it("respects a custom throttleThresholdPct", () => {
    // Period = 1000; cap = 300; today = 200 = 66.7%
    // With throttleThresholdPct = 60, should throttle
    const s = computeConsistencyStatus(
      { consistencyPct: 30, throttleThresholdPct: 60 },
      TODAY,
      days([
        ["2026-06-09", 500],
        ["2026-06-10", 500],
        [TODAY, 200],
      ]),
    );
    expect(s.action).toBe("throttle");
  });
});

// ── pause — cap reached ───────────────────────────────────────────────────────

describe("pause — daily cap reached", () => {
  it("pauses when today's profit equals the cap", () => {
    // Period = 1000; cap = 300; today = 300 → pause
    const s = computeConsistencyStatus(
      { consistencyPct: 30 },
      TODAY,
      days([
        ["2026-06-09", 500],
        ["2026-06-10", 500],
        [TODAY, 300],
      ]),
    );
    expect(s.action).toBe("pause");
    expect(s.remainingUsd).toBeNull();
    expect(s.reason).toMatch(/cap/i);
  });

  it("pauses when today's profit exceeds the cap", () => {
    const s = computeConsistencyStatus(
      { consistencyPct: 30 },
      TODAY,
      days([
        ["2026-06-09", 500],
        ["2026-06-10", 500],
        [TODAY, 400],
      ]),
    );
    expect(s.action).toBe("pause");
  });
});

// ── only profitable days contribute to period total ──────────────────────────

describe("period total only counts profitable days", () => {
  it("loss days do not reduce the period total", () => {
    // Prior days: +500, -200, +500 → profitable prior total = 1000 (loss excluded)
    const s = computeConsistencyStatus(
      { consistencyPct: 30 },
      TODAY,
      days([
        ["2026-06-08", 500],
        ["2026-06-09", -200],
        ["2026-06-10", 500],
        [TODAY, 290],
      ]),
    );
    expect(s.periodTotalProfitUsd).toBe(1000); // 500 + 500 (loss excluded)
    expect(s.dailyCapUsd).toBe(300);
    // 290 / 300 = 96.7% → throttle
    expect(s.action).toBe("throttle");
  });
});

// ── consistencyBlockReason ────────────────────────────────────────────────────

describe("consistencyBlockReason", () => {
  it("returns null when action is ok", () => {
    const s = computeConsistencyStatus({ consistencyPct: 30 }, TODAY, []);
    expect(consistencyBlockReason(s)).toBeNull();
  });

  it("returns null when action is throttle (throttle does not hard-block)", () => {
    const s = computeConsistencyStatus(
      { consistencyPct: 30 },
      TODAY,
      days([["2026-06-09", 1000], [TODAY, 280]]),
    );
    expect(consistencyBlockReason(s)).toBeNull();
  });

  it("returns the reason string when action is pause", () => {
    const s = computeConsistencyStatus(
      { consistencyPct: 30 },
      TODAY,
      days([["2026-06-09", 1000], [TODAY, 300]]),
    );
    expect(consistencyBlockReason(s)).not.toBeNull();
    expect(consistencyBlockReason(s)).toMatch(/cap/i);
  });
});

// ── profitDistribution passthrough ───────────────────────────────────────────

describe("profitDistribution", () => {
  it("includes all days in the distribution for the chart", () => {
    const allDays = days([
      ["2026-06-09", 500],
      ["2026-06-10", -100],
      [TODAY, 200],
    ]);
    const s = computeConsistencyStatus({ consistencyPct: 30 }, TODAY, allDays);
    expect(s.profitDistribution).toHaveLength(3);
  });
});
