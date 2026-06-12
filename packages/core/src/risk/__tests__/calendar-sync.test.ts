/**
 * Calendar sync unit tests (PRD VCH-RSK-06b/06c).
 *
 * Covers: the JBlanked 1-request/day guard (incl. no same-day retry on
 * non-network errors), the ForexFactory fallback trigger + 5-minute guard,
 * non-JSON ("Request Denied") handling, and the fail-safe condition when
 * both sources are stale/failed.
 */
import { describe, it, expect, vi } from "vitest";
import {
  syncCalendar,
  JBLANKED_CALENDAR_URL,
  FF_CALENDAR_URL,
  type CalendarStore,
  type CalendarEventUpsert,
  type CalendarSource,
  type FetchStatus,
} from "../calendar-sync";

const NOW = new Date("2026-06-10T12:00:00.000Z");
const API_KEY = "test-key";

// ── Fakes ─────────────────────────────────────────────────────────────────────

interface FakeStoreState {
  log: { source: CalendarSource; status: FetchStatus; fetched_at: string; error?: string }[];
  events: CalendarEventUpsert[];
  newestFetchedAt: string | null;
}

function makeStore(init?: Partial<FakeStoreState>): { store: CalendarStore; state: FakeStoreState } {
  const state: FakeStoreState = {
    log: init?.log ?? [],
    events: init?.events ?? [],
    newestFetchedAt: init?.newestFetchedAt ?? null,
  };
  const store: CalendarStore = {
    async fetchAttemptsSince(source, sinceIso) {
      return state.log
        .filter((l) => l.source === source && l.fetched_at >= sinceIso)
        .sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))
        .map((l) => ({ status: l.status, fetched_at: l.fetched_at }));
    },
    async newestEventFetchedAt() {
      const fromEvents = state.events.map((e) => e.fetched_at).sort().pop() ?? null;
      return fromEvents ?? state.newestFetchedAt;
    },
    async upsertEvents(rows) {
      state.events.push(...rows);
    },
    async logFetch(source, status, error) {
      state.log.push({ source, status, fetched_at: NOW.toISOString(), error });
    },
  };
  return { store, state };
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}
function textResponse(body: string, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

const JB_EVENT = { Name: "CPI y/y", Currency: "USD", Date: "2026.06.10 08:30", Impact: "High", Forecast: "3.1%", Previous: "3.4%" };
const FF_EVENT = { title: "FOMC Statement", country: "USD", date: "2026-06-10T14:00:00-04:00", impact: "High", forecast: "", previous: "" };

const FRESH_ISO = new Date(NOW.getTime() - 1 * 3_600_000).toISOString();   // 1h old
const STALE_ISO = new Date(NOW.getTime() - 50 * 3_600_000).toISOString();  // 50h old

// ── JBlanked 1-request/day guard ─────────────────────────────────────────────

describe("JBlanked daily guard", () => {
  it("never fetches twice in the same UTC day after a success", async () => {
    const { store } = makeStore({
      log: [{ source: "jblanked", status: "success", fetched_at: NOW.toISOString() }],
      newestFetchedAt: FRESH_ISO,
    });
    const fetchFn = vi.fn();
    const r = await syncCalendar(store, fetchFn, { jblankedApiKey: API_KEY, now: NOW });
    expect(r.jblanked).toBe("skipped_daily_guard");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("never retries the same day after a non-network error", async () => {
    const { store } = makeStore({
      log: [{ source: "jblanked", status: "error", fetched_at: NOW.toISOString() }],
      newestFetchedAt: FRESH_ISO,
    });
    const fetchFn = vi.fn();
    const r = await syncCalendar(store, fetchFn, { jblankedApiKey: API_KEY, now: NOW });
    expect(r.jblanked).toBe("skipped_daily_guard");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("allows a same-day retry only after a network error", async () => {
    const { store, state } = makeStore({
      log: [{ source: "jblanked", status: "network_error", fetched_at: NOW.toISOString() }],
      newestFetchedAt: FRESH_ISO,
    });
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([JB_EVENT]));
    const r = await syncCalendar(store, fetchFn, { jblankedApiKey: API_KEY, now: NOW });
    expect(r.jblanked).toBe("fetched");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(JBLANKED_CALENDAR_URL, {
      headers: { Authorization: `Api-Key ${API_KEY}` },
    });
    expect(state.log.at(-1)).toMatchObject({ source: "jblanked", status: "success" });
  });

  it("does not fetch at all without an API key", async () => {
    const { store } = makeStore({ newestFetchedAt: FRESH_ISO });
    const fetchFn = vi.fn();
    const r = await syncCalendar(store, fetchFn, { jblankedApiKey: null, now: NOW });
    expect(r.jblanked).toBe("skipped_no_key");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("normalises JBlanked events to UTC and the impact enum", async () => {
    const { store, state } = makeStore({ newestFetchedAt: FRESH_ISO });
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([JB_EVENT]));
    await syncCalendar(store, fetchFn, { jblankedApiKey: API_KEY, now: NOW });
    const e = state.events[0]!;
    // 2026-06-10 08:30 EDT (UTC-4) → 12:30Z
    expect(e.event_time_utc).toBe("2026-06-10T12:30:00.000Z");
    expect(e.impact).toBe("high");
    expect(e.source).toBe("jblanked");
    expect(e.currency).toBe("USD");
  });
});

// ── ForexFactory fallback ─────────────────────────────────────────────────────

describe("ForexFactory fallback", () => {
  it("is not used while the cache is fresh", async () => {
    const { store } = makeStore({
      log: [{ source: "jblanked", status: "success", fetched_at: NOW.toISOString() }],
      newestFetchedAt: FRESH_ISO,
    });
    const fetchFn = vi.fn();
    const r = await syncCalendar(store, fetchFn, { jblankedApiKey: API_KEY, now: NOW });
    expect(r.fallback).toBe("not_needed");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fetches FF when the cache is stale (>48h) and clears staleness", async () => {
    const { store, state } = makeStore({
      log: [{ source: "jblanked", status: "error", fetched_at: NOW.toISOString() }],
      newestFetchedAt: STALE_ISO,
    });
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([FF_EVENT]));
    const r = await syncCalendar(store, fetchFn, { jblankedApiKey: API_KEY, now: NOW });
    expect(r.fallback).toBe("fetched");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(FF_CALENDAR_URL);
    expect(r.staleAfter).toBe(false);
    // explicit -04:00 offset respected → 18:00Z
    expect(state.events[0]!.event_time_utc).toBe("2026-06-10T18:00:00.000Z");
    expect(state.events[0]!.source).toBe("forexfactory");
  });

  it("respects the 5-minute spacing guard", async () => {
    const twoMinAgo = new Date(NOW.getTime() - 2 * 60_000).toISOString();
    const { store } = makeStore({
      log: [
        { source: "jblanked", status: "error", fetched_at: NOW.toISOString() },
        { source: "forexfactory", status: "network_error", fetched_at: twoMinAgo },
      ],
      newestFetchedAt: STALE_ISO,
    });
    const fetchFn = vi.fn();
    const r = await syncCalendar(store, fetchFn, { jblankedApiKey: API_KEY, now: NOW });
    expect(r.fallback).toBe("skipped_rate_guard");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r.staleAfter).toBe(true);
  });

  it("treats a non-JSON response (Request Denied HTML) as rate-limited and never parses it", async () => {
    const { store, state } = makeStore({
      log: [{ source: "jblanked", status: "error", fetched_at: NOW.toISOString() }],
      newestFetchedAt: STALE_ISO,
    });
    const fetchFn = vi.fn().mockResolvedValue(
      textResponse("<html><body>Request Denied</body></html>")
    );
    const r = await syncCalendar(store, fetchFn, { jblankedApiKey: API_KEY, now: NOW });
    expect(r.fallback).toBe("failed");
    expect(state.events).toHaveLength(0);
    expect(state.log.at(-1)).toMatchObject({ source: "forexfactory", status: "rate_limited" });
  });
});

// ── Fail-safe condition ───────────────────────────────────────────────────────

describe("fail-safe trigger", () => {
  it("reports staleAfter=true when BOTH sources fail and the cache is stale", async () => {
    const { store } = makeStore({ newestFetchedAt: STALE_ISO });
    const fetchFn = vi.fn(async (url: string) => {
      if (url === JBLANKED_CALENDAR_URL) return textResponse("server error", 500);
      return textResponse("<html>Request Denied</html>"); // FF non-JSON
    });
    const r = await syncCalendar(store, fetchFn, { jblankedApiKey: API_KEY, now: NOW });
    expect(r.jblanked).toBe("failed");
    expect(r.fallback).toBe("failed");
    expect(r.staleAfter).toBe(true); // → executor engages conservative news blocks
  });

  it("staleAfter=false when JBlanked succeeds even if FF would fail", async () => {
    const { store } = makeStore({ newestFetchedAt: STALE_ISO });
    const fetchFn = vi.fn(async (url: string) => {
      if (url === JBLANKED_CALENDAR_URL) return jsonResponse([JB_EVENT]);
      return textResponse("<html>Request Denied</html>");
    });
    const r = await syncCalendar(store, fetchFn, { jblankedApiKey: API_KEY, now: NOW });
    expect(r.jblanked).toBe("fetched");
    expect(r.staleAfter).toBe(false);
  });
});
