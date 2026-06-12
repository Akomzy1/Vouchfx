/**
 * Economic-calendar wiring for the executor (PRD VCH-RSK-06b, VCH-RSK-06c).
 *
 *  - SupabaseCalendarStore: the injected store used by core's syncCalendar.
 *  - startCalendarSchedule: hourly tick — the daily JBlanked fetch and the
 *    stale-cache ForexFactory fallback are both rate-guarded INSIDE
 *    syncCalendar via calendar_fetch_log, so ticking hourly never exceeds
 *    source limits (JBlanked: 1/day; FF: ≤1 per 5 min, only when stale).
 *  - checkNewsFilterGate: the decision-time check used by the worker. It
 *    reads calendar_events in Postgres EXCLUSIVELY — never a feed.
 *  - Fail-safe transitions raise an ops alert via the notifications path.
 */

import {
  syncCalendar,
  isCacheStale,
  isInFailSafeWindow,
  symbolCurrencies,
  notify,
  FAILSAFE_BLOCKS_NON_PROP,
  type CalendarStore,
  type CalendarEventUpsert,
  type CalendarSource,
  type FetchStatus,
  type RiskSettings,
  type Logger,
} from "@vouchfx/core";
import type { TypedClient } from "@vouchfx/db";

// ── Store implementation ──────────────────────────────────────────────────────

export function createCalendarStore(db: TypedClient): CalendarStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbAny = db as any;
  return {
    async fetchAttemptsSince(source: CalendarSource, sinceIso: string) {
      const { data } = await dbAny
        .from("calendar_fetch_log")
        .select("status, fetched_at")
        .eq("source", source)
        .gte("fetched_at", sinceIso)
        .order("fetched_at", { ascending: false });
      return (data ?? []) as { status: FetchStatus; fetched_at: string }[];
    },
    async newestEventFetchedAt() {
      const { data } = await dbAny
        .from("calendar_events")
        .select("fetched_at")
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as { fetched_at: string } | null)?.fetched_at ?? null;
    },
    async upsertEvents(rows: CalendarEventUpsert[]) {
      if (rows.length === 0) return;
      // Chunk to stay under request-size limits
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await dbAny
          .from("calendar_events")
          .upsert(rows.slice(i, i + 200), {
            onConflict: "event_name,currency,event_time_utc",
          });
        if (error) throw new Error(`calendar_events upsert: ${error.message}`);
      }
    },
    async logFetch(source: CalendarSource, status: FetchStatus, error?: string) {
      await dbAny.from("calendar_fetch_log").insert({ source, status, error: error ?? null });
    },
  };
}

// ── Hourly schedule + fail-safe ops alert ─────────────────────────────────────

interface CalendarDeps {
  db: TypedClient;
  log: Logger;
  jblankedApiKey: string | null;
  resendApiKey: string | null;
  adminEmails: string | null; // comma-separated, from ADMIN_EMAILS
}

// Edge-triggered fail-safe state (in-memory; re-alerts once after restart
// if still in fail-safe, which is acceptable for an ops signal).
let lastFailSafeState: boolean | null = null;

async function alertOps(deps: CalendarDeps, entering: boolean, detail: string): Promise<void> {
  const { db, log, resendApiKey, adminEmails } = deps;
  const title = entering
    ? "Calendar fail-safe ENGAGED — conservative news blocks active"
    : "Calendar fail-safe cleared — live calendar data restored";
  log.warn(`[calendar] ${title}`, { detail });

  // In-app + email to admin users (matched by ADMIN_EMAILS)
  const emails = (adminEmails ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length === 0) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: admins } = await (db as any)
      .from("users")
      .select("id, email")
      .in("email", emails);

    for (const a of (admins ?? []) as { id: string; email: string }[]) {
      await notify(db, {
        userId: a.id,
        toEmail: a.email,
        event: "calendar_failsafe",
        title,
        body: detail,
        resendApiKey,
      });
    }
  } catch (err) {
    log.error("[calendar] ops alert failed", { error: (err as Error).message });
  }
}

export async function calendarTick(deps: CalendarDeps): Promise<void> {
  const { db, log, jblankedApiKey } = deps;
  const store = createCalendarStore(db);

  const result = await syncCalendar(store, fetch, { jblankedApiKey });
  log.info("[calendar] sync", {
    jblanked: result.jblanked,
    fallback: result.fallback,
    upserted: result.eventsUpserted,
    stale: result.staleAfter,
  });

  // Fail-safe = cache stale (>48h) AND the fallback could not refresh it.
  const failSafe = result.staleAfter;
  if (lastFailSafeState === null) {
    // First tick after boot: only alert if we're starting INSIDE fail-safe.
    if (failSafe) {
      await alertOps(deps, true, "Calendar cache stale >48h and fallback feed unavailable. Prop accounts will be blocked during conservative high-impact windows (13:25–13:40 & 18:55–19:10 UTC, weekdays).");
    }
  } else if (failSafe !== lastFailSafeState) {
    await alertOps(
      deps,
      failSafe,
      failSafe
        ? "Calendar cache stale >48h and fallback feed unavailable. Prop accounts will be blocked during conservative high-impact windows (13:25–13:40 & 18:55–19:10 UTC, weekdays)."
        : "A calendar feed recovered; the news filter is using live cached data again."
    );
  }
  lastFailSafeState = failSafe;
}

/** Hourly tick (plus one shortly after boot). Rate limits enforced inside. */
export function startCalendarSchedule(deps: CalendarDeps, intervalMs = 60 * 60_000): () => void {
  const run = () =>
    calendarTick(deps).catch((err) =>
      deps.log.error("[calendar] tick error", { error: (err as Error).message })
    );

  const bootTimer = setTimeout(run, 15_000);
  const timer = setInterval(run, intervalMs);
  return () => {
    clearTimeout(bootTimer);
    clearInterval(timer);
  };
}

// ── Decision-time gate (reads the Postgres cache ONLY) ───────────────────────

export type NewsGateResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * News-filter check for a new signal (worker execution path).
 *
 *  - Fresh cache + user filter ON  → block when a high-impact event for the
 *    symbol's currencies (or 'All') sits inside ±newsFilterWindowMin.
 *  - Stale cache (>48h, fallback failed) → FAIL SAFE: accounts with an active
 *    prop profile are blocked during conservative high-impact UTC windows;
 *    non-prop accounts get a logged warning only (FAILSAFE_BLOCKS_NON_PROP).
 */
export async function checkNewsFilterGate(
  db: TypedClient,
  brokerConnectionId: string,
  symbol: string,
  settings: RiskSettings,
  log: Logger,
  now: Date = new Date()
): Promise<NewsGateResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbAny = db as any;

  const { data: newestRow } = await dbAny
    .from("calendar_events")
    .select("fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const newest = (newestRow as { fetched_at: string } | null)?.fetched_at ?? null;
  const stale = isCacheStale(newest ? new Date(newest) : null, now);

  if (!stale) {
    if (!settings.newsFilterEnabled) return { ok: true };

    const currencies = symbolCurrencies(symbol);
    if (currencies.length === 0) return { ok: true };

    const windowMs = settings.newsFilterWindowMin * 60_000;
    const from = new Date(now.getTime() - windowMs).toISOString();
    const to = new Date(now.getTime() + windowMs).toISOString();

    const { data: hits } = await dbAny
      .from("calendar_events")
      .select("event_name, currency, event_time_utc")
      .eq("impact", "high")
      .gte("event_time_utc", from)
      .lte("event_time_utc", to)
      .in("currency", [...currencies, "All"])
      .limit(1);

    const hit = ((hits ?? []) as { event_name: string; currency: string; event_time_utc: string }[])[0];
    if (hit) {
      return {
        ok: false,
        reason: `news_filter:${hit.currency} ${hit.event_name} @ ${hit.event_time_utc}`,
      };
    }
    return { ok: true };
  }

  // ── Stale cache: fail-safe mode (VCH-RSK-06c) ─────────────────────────────
  const { data: propRow } = await dbAny
    .from("prop_account_profiles")
    .select("id")
    .eq("broker_connection_id", brokerConnectionId)
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();
  const isProp = !!propRow;

  if (isProp || FAILSAFE_BLOCKS_NON_PROP) {
    if (isInFailSafeWindow(now)) {
      return {
        ok: false,
        reason: "calendar data unavailable — conservative news block",
      };
    }
    return { ok: true };
  }

  log.warn("[calendar] cache stale — news filter cannot be evaluated (non-prop account, not blocking)", {
    symbol,
    newest_fetched_at: newest,
  });
  return { ok: true };
}
