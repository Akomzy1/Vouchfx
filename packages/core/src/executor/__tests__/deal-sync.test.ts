import { describe, it, expect } from "vitest";
import { extractCloseDeals, isFullyClosed, reconcileTradeCloses } from "../deal-sync";

// Raw MetaApi-shaped deals
const closeDeal = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  positionId: "p1",
  entryType: "DEAL_ENTRY_OUT",
  volume: 0.01,
  price: 1.335,
  profit: 4.2,
  commission: -0.1,
  swap: -0.05,
  time: "2026-07-03T00:08:39.300Z",
  ...over,
});

describe("extractCloseDeals", () => {
  it("keeps closing deals and nets profit + commission + swap", () => {
    const out = extractCloseDeals([closeDeal()]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ dealId: "d1", positionId: "p1", volume: 0.01, price: 1.335 });
    expect(out[0]!.pnl).toBeCloseTo(4.05, 10); // 4.2 − 0.1 − 0.05
    expect(out[0]!.time).toBe("2026-07-03T00:08:39.300Z");
  });

  it("ignores entry deals, balance ops, and deals without a position id", () => {
    expect(
      extractCloseDeals([
        closeDeal({ entryType: "DEAL_ENTRY_IN" }),
        closeDeal({ positionId: null }),
        { id: "b1", type: "DEAL_TYPE_BALANCE", profit: 100 },
      ])
    ).toHaveLength(0);
  });

  it("accepts OUT_BY (close-by) deals and missing money fields", () => {
    const out = extractCloseDeals([closeDeal({ entryType: "DEAL_ENTRY_OUT_BY", commission: undefined, swap: undefined })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.pnl).toBeCloseTo(4.2, 10);
  });
});

describe("isFullyClosed", () => {
  it("covers full volume, tolerates lot-step rounding", () => {
    expect(isFullyClosed(0.12, 0.12)).toBe(true);
    expect(isFullyClosed(0.12, 0.1199999)).toBe(true); // within eps
    expect(isFullyClosed(0.12, 0.06)).toBe(false);
  });
});

describe("reconcileTradeCloses", () => {
  it("single deal covering the volume → closed_full", () => {
    const r = reconcileTradeCloses(0.01, extractCloseDeals([closeDeal()]));
    expect(r.fullyClosed).toBe(true);
    expect(r.events[0]!.eventType).toBe("closed_full");
    expect(r.closedAt).toBe("2026-07-03T00:08:39.300Z");
  });

  it("partial then final: first is closed_partial, completing one is closed_full", () => {
    const deals = extractCloseDeals([
      closeDeal({ id: "d2", volume: 0.06, time: "2026-07-03T01:00:00.000Z", profit: 2 }),
      closeDeal({ id: "d1", volume: 0.06, time: "2026-07-03T00:30:00.000Z", profit: 1 }),
    ]);
    const r = reconcileTradeCloses(0.12, deals);
    // chronological order despite input order
    expect(r.events.map((e) => e.dealId)).toEqual(["d1", "d2"]);
    expect(r.events.map((e) => e.eventType)).toEqual(["closed_partial", "closed_full"]);
    expect(r.fullyClosed).toBe(true);
    expect(r.closedAt).toBe("2026-07-03T01:00:00.000Z");
  });

  it("partial-only closes leave the trade open", () => {
    const r = reconcileTradeCloses(0.12, extractCloseDeals([closeDeal({ volume: 0.04 })]));
    expect(r.fullyClosed).toBe(false);
    expect(r.events[0]!.eventType).toBe("closed_partial");
  });

  it("no deals → nothing to do", () => {
    const r = reconcileTradeCloses(0.12, []);
    expect(r.events).toHaveLength(0);
    expect(r.fullyClosed).toBe(false);
    expect(r.closedAt).toBeNull();
  });
});
