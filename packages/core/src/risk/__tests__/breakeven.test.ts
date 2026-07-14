import { describe, it, expect } from "vitest";
import { shouldMoveToBreakeven } from "../breakeven";

describe("shouldMoveToBreakeven", () => {
  // BUY at 100 with SL 90 → SL distance 10 → trigger at 110.
  it("BUY: triggers exactly at 1R", () => {
    expect(shouldMoveToBreakeven({ side: "BUY", entryPrice: 100, sl: 90, currentPrice: 110 })).toBe(true);
  });

  it("BUY: does not trigger just below 1R", () => {
    expect(shouldMoveToBreakeven({ side: "BUY", entryPrice: 100, sl: 90, currentPrice: 109.99 })).toBe(false);
  });

  it("BUY: triggers beyond 1R", () => {
    expect(shouldMoveToBreakeven({ side: "BUY", entryPrice: 100, sl: 90, currentPrice: 125 })).toBe(true);
  });

  it("BUY: never triggers while losing", () => {
    expect(shouldMoveToBreakeven({ side: "BUY", entryPrice: 100, sl: 90, currentPrice: 95 })).toBe(false);
  });

  // SELL at 100 with SL 110 → SL distance 10 → trigger at 90.
  it("SELL: triggers exactly at 1R", () => {
    expect(shouldMoveToBreakeven({ side: "SELL", entryPrice: 100, sl: 110, currentPrice: 90 })).toBe(true);
  });

  it("SELL: does not trigger just below 1R", () => {
    expect(shouldMoveToBreakeven({ side: "SELL", entryPrice: 100, sl: 110, currentPrice: 90.01 })).toBe(false);
  });

  it("SELL: never triggers while losing", () => {
    expect(shouldMoveToBreakeven({ side: "SELL", entryPrice: 100, sl: 110, currentPrice: 104 })).toBe(false);
  });

  // Stops already at/through entry have nothing to protect.
  it("skips when SL is already at entry (breakeven already applied)", () => {
    expect(shouldMoveToBreakeven({ side: "BUY", entryPrice: 100, sl: 100, currentPrice: 150 })).toBe(false);
  });

  it("skips when SL is already in profit (BUY stop above entry)", () => {
    expect(shouldMoveToBreakeven({ side: "BUY", entryPrice: 100, sl: 105, currentPrice: 150 })).toBe(false);
  });

  it("skips when SL is on the wrong side for SELL", () => {
    expect(shouldMoveToBreakeven({ side: "SELL", entryPrice: 100, sl: 95, currentPrice: 50 })).toBe(false);
  });

  // Invalid inputs never trigger.
  it("skips when SL is null", () => {
    expect(shouldMoveToBreakeven({ side: "BUY", entryPrice: 100, sl: null, currentPrice: 200 })).toBe(false);
  });

  it("skips on non-finite or non-positive inputs", () => {
    expect(shouldMoveToBreakeven({ side: "BUY", entryPrice: NaN, sl: 90, currentPrice: 110 })).toBe(false);
    expect(shouldMoveToBreakeven({ side: "BUY", entryPrice: 100, sl: 0, currentPrice: 110 })).toBe(false);
    expect(shouldMoveToBreakeven({ side: "BUY", entryPrice: 100, sl: 90, currentPrice: 0 })).toBe(false);
    expect(shouldMoveToBreakeven({ side: "BUY", entryPrice: 100, sl: 90, currentPrice: Infinity })).toBe(false);
  });

  // Realistic scale: BTC BUY at 63893.53, SL 63254.59 (dist ≈ 638.94) → trigger ≈ 64532.47.
  it("works at crypto price scale", () => {
    const entry = 63893.53, sl = 63254.5947;
    expect(shouldMoveToBreakeven({ side: "BUY", entryPrice: entry, sl, currentPrice: 64500 })).toBe(false);
    expect(shouldMoveToBreakeven({ side: "BUY", entryPrice: entry, sl, currentPrice: 64533 })).toBe(true);
  });
});
