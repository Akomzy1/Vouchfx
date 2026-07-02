import { describe, it, expect } from "vitest";
import { resolveBrokerSymbol, SYMBOL_VARIANTS } from "../symbol-map";

const GOLD = SYMBOL_VARIANTS.XAUUSD!;

describe("resolveBrokerSymbol — gold/suffix auto-detection (VCH-BRK-03)", () => {
  it("matches the plain canonical symbol", () => {
    expect(resolveBrokerSymbol("XAUUSD", GOLD, ["EURUSD", "XAUUSD", "GBPJPY"])).toBe("XAUUSD");
  });

  it("matches a known alias exactly (GOLD)", () => {
    expect(resolveBrokerSymbol("XAUUSD", GOLD, ["GOLD", "EURUSD"])).toBe("GOLD");
  });

  it("resolves broker suffix formats the static list omits", () => {
    expect(resolveBrokerSymbol("XAUUSD", GOLD, ["XAUUSD.c", "EURUSD.c"])).toBe("XAUUSD.c");
    expect(resolveBrokerSymbol("XAUUSD", GOLD, ["XAUUSD_i"])).toBe("XAUUSD_i");
    expect(resolveBrokerSymbol("XAUUSD", GOLD, ["XAUUSDmicro"])).toBe("XAUUSDmicro");
    expect(resolveBrokerSymbol("XAUUSD", GOLD, ["GOLD."])).toBe("GOLD.");
    expect(resolveBrokerSymbol("XAUUSD", GOLD, ["GOLDmicro"])).toBe("GOLDmicro");
  });

  it("prefers an exact match over a suffixed one", () => {
    expect(resolveBrokerSymbol("XAUUSD", GOLD, ["XAUUSDm", "XAUUSD"])).toBe("XAUUSD");
  });

  it("prefers the shortest (plainest) variant when only suffixed ones exist", () => {
    expect(resolveBrokerSymbol("XAUUSD", GOLD, ["XAUUSDmicro", "XAUUSD.c"])).toBe("XAUUSD.c");
  });

  it("returns null when the broker has no gold symbol", () => {
    expect(resolveBrokerSymbol("XAUUSD", GOLD, ["EURUSD", "GBPUSD", "USDJPY"])).toBeNull();
  });

  it("does NOT mistake a different instrument for a suffixed base (EURUSD ≠ EURUSDT)", () => {
    expect(resolveBrokerSymbol("EURUSD", ["EURUSD"], ["EURUSDT", "GBPUSD"])).toBeNull();
  });

  it("normalizes separators and case", () => {
    expect(resolveBrokerSymbol("XAUUSD", GOLD, ["xau/usd"])).toBe("xau/usd");
  });
});
