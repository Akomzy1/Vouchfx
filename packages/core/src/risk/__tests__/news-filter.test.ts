/**
 * News filter unit tests (PRD VCH-RSK-06b/06c).
 *
 * Covers: UTC conversion around US DST transitions for both feed formats,
 * impact mapping, the decision-time window check, fail-safe windows,
 * cache staleness, and that the filter performs no network I/O.
 *
 * US DST 2026: begins Sun Mar 8 (EST→EDT), ends Sun Nov 1 (EDT→EST).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseJBlankedTime,
  parseFFTime,
  zonedTimeToUtc,
  mapImpact,
  isNewsBlocked,
  isCacheStale,
  isInFailSafeWindow,
  FAILSAFE_WINDOWS_UTC,
  type CalendarEvent,
} from "../news-filter";

// ── UTC conversion — JBlanked format (Eastern site time, no offset) ──────────

describe("parseJBlankedTime — DST boundaries", () => {
  it("converts EST (winter, UTC-5) before the March transition", () => {
    expect(parseJBlankedTime("2026.03.07 13:30")?.toISOString())
      .toBe("2026-03-07T18:30:00.000Z");
  });

  it("converts EDT (summer, UTC-4) after the March transition", () => {
    expect(parseJBlankedTime("2026.03.09 13:30")?.toISOString())
      .toBe("2026-03-09T17:30:00.000Z");
  });

  it("handles the spring-forward day itself (Mar 8 2026, after 2am = EDT)", () => {
    expect(parseJBlankedTime("2026.03.08 13:30")?.toISOString())
      .toBe("2026-03-08T17:30:00.000Z");
  });

  it("converts EDT before the November transition", () => {
    expect(parseJBlankedTime("2026.10.31 09:00")?.toISOString())
      .toBe("2026-10-31T13:00:00.000Z");
  });

  it("converts EST after the November transition", () => {
    expect(parseJBlankedTime("2026.11.02 09:00")?.toISOString())
      .toBe("2026-11-02T14:00:00.000Z");
  });

  it("handles the fall-back day itself (Nov 1 2026, after 2am = EST)", () => {
    expect(parseJBlankedTime("2026.11.01 09:00")?.toISOString())
      .toBe("2026-11-01T14:00:00.000Z");
  });

  it("returns null for malformed input", () => {
    expect(parseJBlankedTime("not a date")).toBeNull();
    expect(parseJBlankedTime("2026-03-09 13:30")).toBeNull(); // wrong separator
  });
});

// ── UTC conversion — ForexFactory format ──────────────────────────────────────

describe("parseFFTime — DST boundaries", () => {
  it("respects an explicit UTC offset when present", () => {
    expect(parseFFTime("2026-03-09T08:30:00-04:00")?.toISOString())
      .toBe("2026-03-09T12:30:00.000Z");
    expect(parseFFTime("2026-01-15T08:30:00-05:00")?.toISOString())
      .toBe("2026-01-15T13:30:00.000Z");
    expect(parseFFTime("2026-06-01T12:00:00Z")?.toISOString())
      .toBe("2026-06-01T12:00:00.000Z");
  });

  it("treats a naive timestamp as US-Eastern — EDT before November transition", () => {
    expect(parseFFTime("2026-10-30T09:00:00")?.toISOString())
      .toBe("2026-10-30T13:00:00.000Z");
  });

  it("treats a naive timestamp as US-Eastern — EST after November transition", () => {
    expect(parseFFTime("2026-11-03T09:00:00")?.toISOString())
      .toBe("2026-11-03T14:00:00.000Z");
  });

  it("treats a naive timestamp as US-Eastern — across the March transition", () => {
    expect(parseFFTime("2026-03-06T09:00:00")?.toISOString())
      .toBe("2026-03-06T14:00:00.000Z"); // EST
    expect(parseFFTime("2026-03-10T09:00:00")?.toISOString())
      .toBe("2026-03-10T13:00:00.000Z"); // EDT
  });

  it("returns null for malformed input", () => {
    expect(parseFFTime("Request Denied")).toBeNull();
  });
});

describe("zonedTimeToUtc", () => {
  it("round-trips a London time correctly", () => {
    expect(zonedTimeToUtc(2026, 7, 1, 12, 0, "Europe/London").toISOString())
      .toBe("2026-07-01T11:00:00.000Z"); // BST = UTC+1
  });
});

// ── Impact mapping ────────────────────────────────────────────────────────────

describe("mapImpact", () => {
  it("maps both feeds' labels to the enum", () => {
    expect(mapImpact("High")).toBe("high");
    expect(mapImpact("HIGH")).toBe("high");
    expect(mapImpact("Medium")).toBe("medium");
    expect(mapImpact("Moderate")).toBe("medium");
    expect(mapImpact("Low")).toBe("low");
    expect(mapImpact("Holiday")).toBe("holiday");
    expect(mapImpact("Bank Holiday")).toBe("holiday");
  });

  it("maps unknown/missing to low (never silently high)", () => {
    expect(mapImpact("Non-Economic")).toBe("low");
    expect(mapImpact("")).toBe("low");
    expect(mapImpact(null)).toBe("low");
    expect(mapImpact(undefined)).toBe("low");
  });
});

// ── Decision-time window check ────────────────────────────────────────────────

const NOW = new Date("2026-06-10T13:20:00.000Z");

function ev(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    eventName: "Nonfarm Payrolls",
    currency: "USD",
    eventTimeUtc: new Date("2026-06-10T13:30:00.000Z"), // 10 min from NOW
    impact: "high",
    ...overrides,
  };
}

describe("isNewsBlocked", () => {
  it("blocks a high-impact event for the symbol currency inside the window", () => {
    const r = isNewsBlocked([ev({})], ["USD"], 15, NOW);
    expect(r.blocked).toBe(true);
    expect(r.event?.eventName).toBe("Nonfarm Payrolls");
  });

  it("does not block outside the window", () => {
    expect(isNewsBlocked([ev({})], ["USD"], 5, NOW).blocked).toBe(false);
  });

  it("ignores medium/low/holiday impact", () => {
    expect(isNewsBlocked([ev({ impact: "medium" })], ["USD"], 60, NOW).blocked).toBe(false);
    expect(isNewsBlocked([ev({ impact: "holiday" })], ["USD"], 60, NOW).blocked).toBe(false);
  });

  it("ignores events for unrelated currencies", () => {
    expect(isNewsBlocked([ev({ currency: "JPY" })], ["EUR", "USD"], 60, NOW).blocked).toBe(false);
  });

  it("'All' currency events block every symbol", () => {
    expect(isNewsBlocked([ev({ currency: "All" })], ["GBP"], 60, NOW).blocked).toBe(true);
  });

  it("blocks symmetrically after the event too", () => {
    const past = ev({ eventTimeUtc: new Date("2026-06-10T13:10:00.000Z") }); // 10 min ago
    expect(isNewsBlocked([past], ["USD"], 15, NOW).blocked).toBe(true);
  });

  it("never blocks with an empty currency list or zero window", () => {
    expect(isNewsBlocked([ev({})], [], 60, NOW).blocked).toBe(false);
    expect(isNewsBlocked([ev({})], ["USD"], 0, NOW).blocked).toBe(false);
  });
});

// ── The filter performs NO network I/O ───────────────────────────────────────

describe("filter purity — no network I/O", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("window check, parsing, and fail-safe logic never call fetch", () => {
    isNewsBlocked([ev({})], ["USD"], 60, NOW);
    parseJBlankedTime("2026.06.10 08:30");
    parseFFTime("2026-06-10T08:30:00");
    mapImpact("High");
    isInFailSafeWindow(NOW);
    isCacheStale(new Date(), NOW);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ── Staleness + fail-safe windows ─────────────────────────────────────────────

describe("isCacheStale", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");

  it("empty cache is stale", () => {
    expect(isCacheStale(null, now)).toBe(true);
  });

  it("47h-old cache is fresh; 49h-old cache is stale", () => {
    expect(isCacheStale(new Date(now.getTime() - 47 * 3_600_000), now)).toBe(false);
    expect(isCacheStale(new Date(now.getTime() - 49 * 3_600_000), now)).toBe(true);
  });
});

describe("isInFailSafeWindow", () => {
  it("blocks inside the conservative US-data window on a weekday", () => {
    expect(isInFailSafeWindow(new Date("2026-06-10T13:30:00.000Z"))).toBe(true);  // Wed
    expect(isInFailSafeWindow(new Date("2026-06-10T13:25:00.000Z"))).toBe(true);  // inclusive start
    expect(isInFailSafeWindow(new Date("2026-06-10T13:40:00.000Z"))).toBe(true);  // inclusive end
  });

  it("blocks inside the FOMC window on a weekday", () => {
    expect(isInFailSafeWindow(new Date("2026-06-10T19:00:00.000Z"))).toBe(true);
  });

  it("does not block outside the windows", () => {
    expect(isInFailSafeWindow(new Date("2026-06-10T13:24:00.000Z"))).toBe(false);
    expect(isInFailSafeWindow(new Date("2026-06-10T13:41:00.000Z"))).toBe(false);
    expect(isInFailSafeWindow(new Date("2026-06-10T10:00:00.000Z"))).toBe(false);
  });

  it("never blocks on weekends", () => {
    expect(isInFailSafeWindow(new Date("2026-06-13T13:30:00.000Z"))).toBe(false); // Sat
    expect(isInFailSafeWindow(new Date("2026-06-14T19:00:00.000Z"))).toBe(false); // Sun
  });

  it("uses the configurable window constants", () => {
    expect(FAILSAFE_WINDOWS_UTC).toHaveLength(2);
  });
});
