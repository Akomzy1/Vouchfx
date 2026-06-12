/**
 * Economic-calendar sync (PRD VCH-RSK-06b) — feed fetching with HARD
 * rate-limit guards, normalisation to UTC, and fetch-health logging.
 *
 * Dependencies (store + fetch) are injected so this stays unit-testable and
 * packages/core performs no direct I/O.
 *
 * RATE LIMITS — enforced in code BEFORE any request is made:
 *  - JBlanked free tier: 1 request/day. We check calendar_fetch_log for any
 *    attempt today (UTC); a non-network failure is never retried the same day.
 *  - ForexFactory JSON: max 2 requests / 5 minutes. We make at most ONE
 *    request per 5-minute window, and only when the cache is stale (>48h).
 *    A non-JSON response (their "Request Denied" HTML page) is treated as
 *    rate-limited and never parsed.
 */

import {
  parseJBlankedTime, parseFFTime, mapImpact, isCacheStale,
  type CalendarImpact,
} from "./news-filter";

// ── Injected store interface (implemented over Supabase in the executor) ─────

export type CalendarSource = "jblanked" | "forexfactory";
export type FetchStatus = "success" | "error" | "rate_limited" | "network_error";

export interface CalendarEventUpsert {
  event_name: string;
  currency: string;
  event_time_utc: string; // ISO
  impact: CalendarImpact;
  forecast: string | null;
  previous: string | null;
  source: CalendarSource;
  fetched_at: string; // ISO
}

export interface CalendarStore {
  /** Fetch-log attempts for `source` at/after `sinceIso`, newest first. */
  fetchAttemptsSince(source: CalendarSource, sinceIso: string): Promise<{ status: FetchStatus; fetched_at: string }[]>;
  /** Newest calendar_events.fetched_at, or null when the cache is empty. */
  newestEventFetchedAt(): Promise<string | null>;
  /** Upsert on (event_name, currency, event_time_utc). */
  upsertEvents(rows: CalendarEventUpsert[]): Promise<void>;
  logFetch(source: CalendarSource, status: FetchStatus, error?: string): Promise<void>;
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export const JBLANKED_CALENDAR_URL =
  "https://www.jblanked.com/news/api/forex-factory/calendar/week/";
export const FF_CALENDAR_URL =
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

/** Minimum spacing between ForexFactory requests (their limit: 2 / 5 min). */
export const FF_MIN_INTERVAL_MS = 5 * 60_000;

// ── Lenient feed-row parsing ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

function pick(row: AnyRow, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return null;
}

function normaliseJBlankedEvent(row: AnyRow, fetchedAtIso: string): CalendarEventUpsert | null {
  const name = pick(row, "Name", "name", "Title", "title", "Event", "event");
  const currency = pick(row, "Currency", "currency", "Country", "country") ?? "All";
  const dateRaw = pick(row, "Date", "date", "Time", "time");
  if (!name || !dateRaw) return null;
  const when = parseJBlankedTime(dateRaw);
  if (!when) return null;
  return {
    event_name: name,
    currency,
    event_time_utc: when.toISOString(),
    impact: mapImpact(pick(row, "Impact", "impact", "Strength", "strength")),
    forecast: pick(row, "Forecast", "forecast"),
    previous: pick(row, "Previous", "previous"),
    source: "jblanked",
    fetched_at: fetchedAtIso,
  };
}

function normaliseFFEvent(row: AnyRow, fetchedAtIso: string): CalendarEventUpsert | null {
  const name = pick(row, "title", "Title");
  const currency = pick(row, "country", "Country", "currency") ?? "All";
  const dateRaw = pick(row, "date", "Date");
  if (!name || !dateRaw) return null;
  const when = parseFFTime(dateRaw);
  if (!when) return null;
  return {
    event_name: name,
    currency,
    event_time_utc: when.toISOString(),
    impact: mapImpact(pick(row, "impact", "Impact")),
    forecast: pick(row, "forecast", "Forecast"),
    previous: pick(row, "previous", "Previous"),
    source: "forexfactory",
    fetched_at: fetchedAtIso,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractRows(parsed: any): AnyRow[] | null {
  if (Array.isArray(parsed)) return parsed as AnyRow[];
  if (parsed && typeof parsed === "object") {
    for (const key of ["data", "events", "calendar", "results"]) {
      if (Array.isArray(parsed[key])) return parsed[key] as AnyRow[];
    }
  }
  return null;
}

// ── Sync ──────────────────────────────────────────────────────────────────────

export interface SyncResult {
  jblanked: "fetched" | "skipped_daily_guard" | "skipped_no_key" | "failed";
  fallback: "not_needed" | "fetched" | "skipped_rate_guard" | "failed";
  /** Cache still stale after this run — fail-safe territory. */
  staleAfter: boolean;
  eventsUpserted: number;
}

function utcDayStartIso(now: Date): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function syncCalendar(
  store: CalendarStore,
  fetchFn: FetchLike,
  opts: { jblankedApiKey: string | null; now?: Date }
): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  const result: SyncResult = {
    jblanked: "skipped_no_key",
    fallback: "not_needed",
    staleAfter: false,
    eventsUpserted: 0,
  };

  // ── Primary: JBlanked, at most once per UTC day ──────────────────────────
  if (opts.jblankedApiKey) {
    const todayAttempts = await store.fetchAttemptsSince("jblanked", utcDayStartIso(now));
    // Never retry the same day after a non-network outcome (success OR error
    // OR rate_limited). Only a transport failure may be retried.
    const blockedToday = todayAttempts.some((a) => a.status !== "network_error");

    if (blockedToday) {
      result.jblanked = "skipped_daily_guard";
    } else {
      result.jblanked = await fetchJBlanked(store, fetchFn, opts.jblankedApiKey, now)
        .then((n) => {
          result.eventsUpserted += n;
          return "fetched" as const;
        })
        .catch(() => "failed" as const);
    }
  }

  // ── Fallback: ForexFactory JSON when the cache is stale (>48h) ───────────
  const newestIso = await store.newestEventFetchedAt();
  const stale = isCacheStale(newestIso ? new Date(newestIso) : null, now);

  if (stale) {
    const recentFF = await store.fetchAttemptsSince(
      "forexfactory",
      new Date(now.getTime() - FF_MIN_INTERVAL_MS).toISOString()
    );
    if (recentFF.length > 0) {
      result.fallback = "skipped_rate_guard";
    } else {
      result.fallback = await fetchForexFactory(store, fetchFn, now)
        .then((n) => {
          result.eventsUpserted += n;
          return "fetched" as const;
        })
        .catch(() => "failed" as const);
    }
  }

  const newestAfter = await store.newestEventFetchedAt();
  result.staleAfter = isCacheStale(newestAfter ? new Date(newestAfter) : null, now);
  return result;
}

/** Returns the number of events upserted; throws on any failure (logged first). */
async function fetchJBlanked(
  store: CalendarStore,
  fetchFn: FetchLike,
  apiKey: string,
  now: Date
): Promise<number> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchFn(JBLANKED_CALENDAR_URL, {
      headers: { Authorization: `Api-Key ${apiKey}` },
    });
  } catch (err) {
    await store.logFetch("jblanked", "network_error", String(err).slice(0, 500));
    throw err;
  }

  const body = await res.text();
  if (!res.ok) {
    const status = res.status === 429 ? "rate_limited" : "error";
    await store.logFetch("jblanked", status, `HTTP ${res.status}: ${body.slice(0, 300)}`);
    throw new Error(`JBlanked HTTP ${res.status}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    await store.logFetch("jblanked", "error", `non-JSON response: ${body.slice(0, 200)}`);
    throw new Error("JBlanked returned non-JSON");
  }

  const rows = extractRows(parsed);
  if (!rows) {
    await store.logFetch("jblanked", "error", "unexpected response shape");
    throw new Error("JBlanked unexpected shape");
  }

  const fetchedAtIso = now.toISOString();
  const events = rows
    .map((r) => normaliseJBlankedEvent(r, fetchedAtIso))
    .filter((e): e is CalendarEventUpsert => e !== null);

  await store.upsertEvents(events);
  await store.logFetch("jblanked", "success");
  return events.length;
}

/** Returns the number of events upserted; throws on any failure (logged first). */
async function fetchForexFactory(
  store: CalendarStore,
  fetchFn: FetchLike,
  now: Date
): Promise<number> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchFn(FF_CALENDAR_URL);
  } catch (err) {
    await store.logFetch("forexfactory", "network_error", String(err).slice(0, 500));
    throw err;
  }

  const body = await res.text();
  if (!res.ok) {
    const status = res.status === 429 || res.status === 403 ? "rate_limited" : "error";
    await store.logFetch("forexfactory", status, `HTTP ${res.status}: ${body.slice(0, 300)}`);
    throw new Error(`ForexFactory HTTP ${res.status}`);
  }

  // FF's rate-limit failure mode returns an HTML "Request Denied" page with
  // HTTP 200 — any non-JSON body is treated as rate-limited and NEVER parsed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    await store.logFetch("forexfactory", "rate_limited", `non-JSON response (Request Denied?): ${body.slice(0, 200)}`);
    throw new Error("ForexFactory returned non-JSON");
  }

  const rows = extractRows(parsed);
  if (!rows) {
    await store.logFetch("forexfactory", "error", "unexpected response shape");
    throw new Error("ForexFactory unexpected shape");
  }

  const fetchedAtIso = now.toISOString();
  const events = rows
    .map((r) => normaliseFFEvent(r, fetchedAtIso))
    .filter((e): e is CalendarEventUpsert => e !== null);

  await store.upsertEvents(events);
  await store.logFetch("forexfactory", "success");
  return events.length;
}
