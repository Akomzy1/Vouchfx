import { describe, it, expect } from "vitest";
import {
  isInNewsWindow,
  isWeekendRisk,
  checkMinTradingDays,
  symbolCurrencies,
} from "../prop-timing";
import type { NewsEvent, NewsWindowConfig } from "../prop-timing";

// ── isInNewsWindow ────────────────────────────────────────────────────────────

describe("isInNewsWindow", () => {
  const config: NewsWindowConfig = { beforeMin: 2, afterMin: 2 };
  const NFP_AT = Date.UTC(2026, 5, 6, 12, 30, 0); // 2026-06-06 12:30 UTC
  const events: NewsEvent[] = [
    { eventAtMs: NFP_AT, currencies: ["USD"], impact: "high" },
  ];

  it("returns false when zero window configured", () => {
    expect(isInNewsWindow(NFP_AT, ["USD"], events, { beforeMin: 0, afterMin: 0 })).toBe(false);
  });

  it("returns true when exactly at event time", () => {
    expect(isInNewsWindow(NFP_AT, ["USD"], events, config)).toBe(true);
  });

  it("returns true 1 minute before the event", () => {
    expect(isInNewsWindow(NFP_AT - 60_000, ["USD"], events, config)).toBe(true);
  });

  it("returns true 1 minute after the event", () => {
    expect(isInNewsWindow(NFP_AT + 60_000, ["USD"], events, config)).toBe(true);
  });

  it("returns false 3 minutes before the event (outside window)", () => {
    expect(isInNewsWindow(NFP_AT - 3 * 60_000, ["USD"], events, config)).toBe(false);
  });

  it("returns false 3 minutes after the event (outside window)", () => {
    expect(isInNewsWindow(NFP_AT + 3 * 60_000, ["USD"], events, config)).toBe(false);
  });

  it("returns false when symbol currencies don't match the event", () => {
    // Trading EURJPY — USD news event should not block it
    expect(isInNewsWindow(NFP_AT, ["EUR", "JPY"], events, config)).toBe(false);
  });

  it("returns true when one of the symbol currencies matches", () => {
    // Trading EURUSD — USD news event should block
    expect(isInNewsWindow(NFP_AT, ["EUR", "USD"], events, config)).toBe(true);
  });

  it("ignores medium and low impact events", () => {
    const mediumEvents: NewsEvent[] = [
      { eventAtMs: NFP_AT, currencies: ["USD"], impact: "medium" },
    ];
    expect(isInNewsWindow(NFP_AT, ["USD"], mediumEvents, config)).toBe(false);
  });
});

// ── isWeekendRisk ─────────────────────────────────────────────────────────────

describe("isWeekendRisk", () => {
  // 2026-06-08 is a Monday
  const MONDAY  = Date.UTC(2026, 5, 8, 14, 0, 0);
  const FRIDAY  = Date.UTC(2026, 5, 12, 14, 0, 0); // 14:00 Friday
  const FRIDAY_LATE = Date.UTC(2026, 5, 12, 23, 0, 0); // 23:00 Friday
  const SATURDAY = Date.UTC(2026, 5, 13, 10, 0, 0);
  const SUNDAY  = Date.UTC(2026, 5, 14, 10, 0, 0);

  it("returns false on Monday", () => {
    expect(isWeekendRisk(MONDAY)).toBe(false);
  });

  it("returns false on Friday at 14:00 (not near close)", () => {
    expect(isWeekendRisk(FRIDAY, 60)).toBe(false);
  });

  it("returns true on Friday within 60 min of 23:59 UTC", () => {
    expect(isWeekendRisk(FRIDAY_LATE, 60)).toBe(true);
  });

  it("returns true on Saturday", () => {
    expect(isWeekendRisk(SATURDAY)).toBe(true);
  });

  it("returns true on Sunday", () => {
    expect(isWeekendRisk(SUNDAY)).toBe(true);
  });

  it("respects custom buffer (e.g. 120 min)", () => {
    const FRIDAY_22 = Date.UTC(2026, 5, 12, 22, 5, 0); // 22:05 Friday
    expect(isWeekendRisk(FRIDAY_22, 120)).toBe(true);   // 22:05 is within 2h of 23:59
    expect(isWeekendRisk(FRIDAY_22, 30)).toBe(false);   // not within 30 min
  });
});

// ── checkMinTradingDays ───────────────────────────────────────────────────────

describe("checkMinTradingDays", () => {
  it("met = true when required = 0", () => {
    const r = checkMinTradingDays([], 0);
    expect(r.met).toBe(true);
    expect(r.required).toBe(0);
  });

  it("met = false when fewer trading days than required", () => {
    const r = checkMinTradingDays(["2026-06-09", "2026-06-10"], 5);
    expect(r.met).toBe(false);
    expect(r.completed).toBe(2);
    expect(r.remaining).toBe(3);
    expect(r.reason).toMatch(/3 more/i);
  });

  it("met = true when exactly at the required count", () => {
    const days = ["2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13"];
    const r = checkMinTradingDays(days, 5);
    expect(r.met).toBe(true);
    expect(r.remaining).toBe(0);
    expect(r.reason).toBeNull();
  });

  it("deduplicates: same day appearing multiple times counts once", () => {
    const r = checkMinTradingDays(
      ["2026-06-09", "2026-06-09", "2026-06-10", "2026-06-10"],
      3,
    );
    expect(r.completed).toBe(2);
    expect(r.met).toBe(false);
  });
});

// ── symbolCurrencies ──────────────────────────────────────────────────────────

describe("symbolCurrencies", () => {
  it("extracts a forex pair", () => {
    expect(symbolCurrencies("EURUSD")).toEqual(["EUR", "USD"]);
    expect(symbolCurrencies("USDJPY")).toEqual(["USD", "JPY"]);
    expect(symbolCurrencies("GBPCHF")).toEqual(["GBP", "CHF"]);
  });

  it("handles lowercase input", () => {
    expect(symbolCurrencies("eurusd")).toEqual(["EUR", "USD"]);
  });

  it("resolves XAUUSD as gold/USD", () => {
    expect(symbolCurrencies("XAUUSD")).toEqual(["XAU", "USD"]);
  });

  it("maps index symbols to their calendar currency (USD news moves US30)", () => {
    expect(symbolCurrencies("US30")).toEqual(["USD"]);
    expect(symbolCurrencies("NAS100")).toEqual(["USD"]);
    expect(symbolCurrencies("GER40")).toEqual(["EUR"]);
  });

  it("returns [] for unknown synthetics", () => {
    expect(symbolCurrencies("VOLATILITY75")).toEqual([]);
  });
});
