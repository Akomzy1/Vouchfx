import { describe, it, expect } from "vitest";
import { pipSizeFor, resolveSlDistance } from "../sl-resolve";
import type { SymbolSpec } from "../types";

function spec(overrides: Partial<SymbolSpec>): SymbolSpec {
  return {
    symbol: "EURUSD",
    contractSize: 100_000,
    tickSize: 0.00001,
    tickValue: 1,
    volumeStep: 0.01,
    volumeMin: 0.01,
    volumeMax: 500,
    ...overrides,
  };
}

describe("pipSizeFor — pip value is an asset convention, not a feed precision", () => {
  it("gold is 0.10 regardless of the broker's quote digits", () => {
    expect(pipSizeFor("XAUUSD", spec({ symbol: "XAUUSD", tickSize: 0.01, digits: 2 }))).toBe(0.1);
    expect(pipSizeFor("XAUUSDm", spec({ symbol: "XAUUSDm", tickSize: 0.001, digits: 3 }))).toBe(0.1);
    expect(pipSizeFor("GOLD", spec({ symbol: "GOLD", tickSize: 0.01, digits: 2 }))).toBe(0.1);
  });

  it("gold survives a missing tickSize (MetaApi omission → 0.00001 fallback)", () => {
    expect(pipSizeFor("XAUUSD", spec({ symbol: "XAUUSD", tickSize: 0.00001 }))).toBe(0.1);
  });

  it("silver is 0.01", () => {
    expect(pipSizeFor("XAGUSD", spec({ symbol: "XAGUSD", tickSize: 0.001, digits: 3 }))).toBe(0.01);
  });

  it("5- and 4-digit forex are both 0.0001", () => {
    expect(pipSizeFor("EURUSD", spec({ digits: 5 }))).toBeCloseTo(0.0001, 10);
    expect(pipSizeFor("EURUSD", spec({ digits: 4, tickSize: 0.0001 }))).toBeCloseTo(0.0001, 10);
  });

  it("3- and 2-digit (JPY-style) quotes are both 0.01", () => {
    expect(pipSizeFor("USDJPY", spec({ symbol: "USDJPY", digits: 3, tickSize: 0.001 }))).toBeCloseTo(0.01, 10);
    expect(pipSizeFor("USDJPY", spec({ symbol: "USDJPY", digits: 2, tickSize: 0.01 }))).toBeCloseTo(0.01, 10);
  });

  it("falls back to 10 × tickSize when the broker reports no digits", () => {
    expect(pipSizeFor("US30", spec({ symbol: "US30", tickSize: 0.1 }))).toBeCloseTo(1, 10);
  });
});

describe("resolveSlDistance — pips unit", () => {
  it("150 pips on gold is $15.00 on 2- and 3-decimal feeds alike", () => {
    const twoDigit = spec({ symbol: "XAUUSD", tickSize: 0.01, digits: 2 });
    const threeDigit = spec({ symbol: "XAUUSDm", tickSize: 0.001, digits: 3 });
    expect(resolveSlDistance(150, "pips", 4135, twoDigit)).toBeCloseTo(15, 10);
    expect(resolveSlDistance(150, "pips", 4135, threeDigit)).toBeCloseTo(15, 10);
  });

  it("20 pips on 5-digit forex is 0.0020", () => {
    expect(resolveSlDistance(20, "pips", 1.1, spec({ digits: 5 }))).toBeCloseTo(0.002, 10);
  });
});
