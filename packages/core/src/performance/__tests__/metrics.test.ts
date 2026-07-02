import { describe, it, expect } from "vitest";
import {
  tradeWinPct,
  dayWinPct,
  profitFactor,
  avgWin,
  avgLoss,
  avgTradesPerDay,
  deriveMetrics,
  computeMetricsFromTrades,
  bucketDayKey,
  cumulativeSeries,
  deriveChannelRow,
  type ClosedTradePoint,
  type PerfComponents,
} from "../metrics";

// ── Individual formula helpers ───────────────────────────────────────────────

describe("ratio helpers", () => {
  it("tradeWinPct: winning ÷ total, 0 when no trades", () => {
    expect(tradeWinPct(3, 6)).toBe(50);
    expect(tradeWinPct(0, 0)).toBe(0);
  });

  it("dayWinPct: green ÷ trading days, 0 when none", () => {
    expect(dayWinPct(2, 4)).toBe(50);
    expect(dayWinPct(0, 0)).toBe(0);
  });

  it("profitFactor: gross profit ÷ gross loss, null when no losses", () => {
    expect(profitFactor(160, 90)).toBeCloseTo(1.7778, 4);
    expect(profitFactor(120, 0)).toBeNull();
    expect(profitFactor(0, 50)).toBe(0); // all losses → 0, not null
  });

  it("avgWin / avgLoss: means with correct sign, 0 when none", () => {
    expect(avgWin(160, 3)).toBeCloseTo(53.3333, 4);
    expect(avgWin(0, 0)).toBe(0);
    expect(avgLoss(90, 3)).toBe(-30); // negative
    expect(avgLoss(0, 0)).toBe(0);
  });

  it("avgTradesPerDay: total ÷ trading days, 0 when none", () => {
    expect(avgTradesPerDay(6, 3)).toBe(2);
    expect(avgTradesPerDay(0, 0)).toBe(0);
  });
});

// ── deriveMetrics from raw components (the API path over SQL output) ──────────

describe("deriveMetrics", () => {
  it("computes every ratio from components", () => {
    const c: PerfComponents = {
      netPnl: 70,
      totalTrades: 6,
      winningTrades: 3,
      losingTrades: 3,
      grossProfit: 160,
      grossLoss: 90,
      tradingDays: 3,
      greenDays: 2,
    };
    const m = deriveMetrics(c);
    expect(m.tradeWinPct).toBe(50);
    expect(m.dayWinPct).toBeCloseTo(66.6667, 4);
    expect(m.profitFactor).toBeCloseTo(1.7778, 4);
    expect(m.avgWin).toBeCloseTo(53.3333, 4);
    expect(m.avgLoss).toBe(-30);
    expect(m.avgTradesPerDay).toBe(2);
    expect(m.netPnl).toBe(70);
  });
});

// ── Reference impl against a hand-computed fixture ───────────────────────────

describe("computeMetricsFromTrades (fixture, tz=UTC)", () => {
  // Day 1 (2025-01-01): +100, -40, +10  → net +70, 3 trades, 2 wins  (green)
  // Day 2 (2025-01-02): -30, -20        → net -50, 2 trades, 0 wins  (red)
  // Day 3 (2025-01-03): +50             → net +50, 1 trade,  1 win   (green)
  const trades: ClosedTradePoint[] = [
    { pnl: 100, closedAt: "2025-01-01T08:00:00Z" },
    { pnl: -40, closedAt: "2025-01-01T12:00:00Z" },
    { pnl: 10, closedAt: "2025-01-01T20:00:00Z" },
    { pnl: -30, closedAt: "2025-01-02T09:00:00Z" },
    { pnl: -20, closedAt: "2025-01-02T15:00:00Z" },
    { pnl: 50, closedAt: "2025-01-03T11:00:00Z" },
  ];

  it("matches hand-computed metrics", () => {
    const m = computeMetricsFromTrades(trades, "UTC");
    expect(m.netPnl).toBeCloseTo(70, 6);
    expect(m.totalTrades).toBe(6);
    expect(m.winningTrades).toBe(3);
    expect(m.losingTrades).toBe(3);
    expect(m.grossProfit).toBeCloseTo(160, 6);
    expect(m.grossLoss).toBeCloseTo(90, 6);
    expect(m.tradingDays).toBe(3);
    expect(m.greenDays).toBe(2);
    expect(m.tradeWinPct).toBe(50);
    expect(m.dayWinPct).toBeCloseTo(66.6667, 4);
    expect(m.profitFactor).toBeCloseTo(1.7778, 4);
    expect(m.avgWin).toBeCloseTo(53.3333, 4);
    expect(m.avgLoss).toBe(-30);
    expect(m.avgTradesPerDay).toBe(2);
  });

  it("empty set → zeros and null profit factor", () => {
    const m = computeMetricsFromTrades([], "UTC");
    expect(m).toMatchObject({
      netPnl: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      grossProfit: 0,
      grossLoss: 0,
      tradingDays: 0,
      greenDays: 0,
      tradeWinPct: 0,
      dayWinPct: 0,
      avgWin: 0,
      avgLoss: 0,
      avgTradesPerDay: 0,
    });
    expect(m.profitFactor).toBeNull();
  });

  it("a breakeven (pnl=0) counts in totals but not wins or losses", () => {
    const m = computeMetricsFromTrades(
      [
        { pnl: 10, closedAt: "2025-02-01T10:00:00Z" },
        { pnl: 0, closedAt: "2025-02-01T11:00:00Z" },
      ],
      "UTC"
    );
    expect(m.totalTrades).toBe(2);
    expect(m.winningTrades).toBe(1);
    expect(m.losingTrades).toBe(0);
    expect(m.tradeWinPct).toBe(50); // 1 of 2
    expect(m.profitFactor).toBeNull(); // no losses
  });
});

// ── Timezone day-bucketing: the 23:59 / 00:01 boundary (VCH-PERF-05) ─────────

describe("bucketDayKey timezone boundary", () => {
  // In America/New_York (UTC−5 in January):
  //   local 2025-01-14 23:59  ==  2025-01-15T04:59:00Z
  //   local 2025-01-15 00:01  ==  2025-01-15T05:01:00Z
  const justBefore = "2025-01-15T04:59:00Z";
  const justAfter = "2025-01-15T05:01:00Z";

  it("buckets either side of local midnight into the correct day", () => {
    expect(bucketDayKey(justBefore, "America/New_York")).toBe("2025-01-14");
    expect(bucketDayKey(justAfter, "America/New_York")).toBe("2025-01-15");
  });

  it("same two instants are the SAME UTC day", () => {
    expect(bucketDayKey(justBefore, "UTC")).toBe("2025-01-15");
    expect(bucketDayKey(justAfter, "UTC")).toBe("2025-01-15");
  });

  it("day grouping follows the display tz: 2 trading days in NY, 1 in UTC", () => {
    const trades: ClosedTradePoint[] = [
      { pnl: 10, closedAt: justBefore },
      { pnl: 20, closedAt: justAfter },
    ];
    expect(computeMetricsFromTrades(trades, "America/New_York").tradingDays).toBe(2);
    expect(computeMetricsFromTrades(trades, "UTC").tradingDays).toBe(1);
  });
});

// ── Equity curve + channel derivation ────────────────────────────────────────

describe("cumulativeSeries", () => {
  it("running sum of daily net", () => {
    const out = cumulativeSeries([
      { day: "2025-01-01", netPnl: 70 },
      { day: "2025-01-02", netPnl: -50 },
      { day: "2025-01-03", netPnl: 50 },
    ]);
    expect(out.map((d) => d.cumulative)).toEqual([70, 20, 70]);
  });
});

describe("deriveChannelRow", () => {
  it("adds win %, profit factor and averages", () => {
    const row = deriveChannelRow({
      sourceId: "s1",
      channel: "Gold Sniper VIP",
      netPnl: 70,
      totalTrades: 6,
      winningTrades: 3,
      losingTrades: 3,
      grossProfit: 160,
      grossLoss: 90,
    });
    expect(row.winPct).toBe(50);
    expect(row.profitFactor).toBeCloseTo(1.7778, 4);
    expect(row.avgWin).toBeCloseTo(53.3333, 4);
    expect(row.avgLoss).toBe(-30);
  });
});
