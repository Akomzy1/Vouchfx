/**
 * News filter — pure domain logic (PRD VCH-RSK-06b, VCH-RSK-06c).
 *
 * Everything here is side-effect free: time parsing/normalisation, impact
 * mapping, the window check, and the fail-safe windows. The decision-time
 * check operates on calendar events ALREADY loaded from the Postgres cache —
 * it never performs network I/O (enforced by test).
 *
 * Feed quirks handled at ingest:
 *  - JBlanked dates: "YYYY.MM.DD HH:MM" in ForexFactory site time
 *    (US-Eastern, DST-aware) with no offset.
 *  - ForexFactory JSON dates: ISO strings; when an explicit UTC offset is
 *    present it is respected, otherwise the naive time is treated as
 *    US-Eastern site time.
 */

export type CalendarImpact = "high" | "medium" | "low" | "holiday";

export interface CalendarEvent {
  eventName: string;
  /** ISO currency ('USD', …) or 'All'. */
  currency: string;
  eventTimeUtc: Date;
  impact: CalendarImpact;
}

// ── Timezone conversion ───────────────────────────────────────────────────────

/** ForexFactory's site default timezone (both feeds mirror FF). */
export const FEED_SOURCE_TIMEZONE = "America/New_York";

/** Offset of `timeZone` from UTC at the given instant, in milliseconds. */
function tzOffsetMs(utcInstant: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(new Date(utcInstant))) {
    if (p.type !== "literal") parts[p.type] = parseInt(p.value, 10);
  }
  const asUtc = Date.UTC(
    parts.year!, parts.month! - 1, parts.day!,
    parts.hour! === 24 ? 0 : parts.hour!, parts.minute!, parts.second!
  );
  return asUtc - utcInstant;
}

/**
 * Interpret a wall-clock time in `timeZone` and return the UTC instant.
 * Iterates twice so DST transitions resolve to a stable offset.
 */
export function zonedTimeToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number,
  timeZone: string = FEED_SOURCE_TIMEZONE
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let utc = naive;
  for (let i = 0; i < 2; i++) {
    utc = naive - tzOffsetMs(utc, timeZone);
  }
  return new Date(utc);
}

/** Parse a JBlanked calendar date ("YYYY.MM.DD HH:MM", FF site time) → UTC. */
export function parseJBlankedTime(raw: string): Date | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})[ T](\d{1,2}):(\d{2})/.exec(raw.trim());
  if (!m) return null;
  return zonedTimeToUtc(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!);
}

/**
 * Parse a ForexFactory JSON date → UTC.
 * Respects an explicit offset ("2026-03-09T08:30:00-04:00"); a naive
 * timestamp ("2026-03-09T08:30:00") is treated as US-Eastern site time.
 */
export function parseFFTime(raw: string): Date | null {
  const s = raw.trim();
  // Explicit offset or Z → trust it
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  return zonedTimeToUtc(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!);
}

// ── Impact mapping ────────────────────────────────────────────────────────────

/** Map a feed impact label (JBlanked or FF) to the enum. Unknown → low. */
export function mapImpact(raw: string | null | undefined): CalendarImpact {
  const s = (raw ?? "").trim().toLowerCase();
  if (s.includes("high") || s === "red") return "high";
  if (s.includes("medium") || s.includes("moderate") || s === "orange" || s === "yellow") return "medium";
  if (s.includes("holiday") || s.includes("bank")) return "holiday";
  return "low";
}

// ── Decision-time window check (cache data only — NO network I/O) ────────────
// Symbol → currencies mapping lives in prop-timing.ts (symbolCurrencies).

export interface NewsBlockResult {
  blocked: boolean;
  /** The first matching high-impact event when blocked. */
  event?: CalendarEvent;
}

/**
 * Is a high-impact event for any of `currencies` (or 'All') within
 * ±windowMin minutes of `now`?
 */
export function isNewsBlocked(
  events: readonly CalendarEvent[],
  currencies: readonly string[],
  windowMin: number,
  now: Date
): NewsBlockResult {
  if (windowMin <= 0 || currencies.length === 0) return { blocked: false };
  const windowMs = windowMin * 60_000;
  const wanted = new Set(currencies.map((c) => c.toUpperCase()));

  for (const ev of events) {
    if (ev.impact !== "high") continue;
    const cur = ev.currency.toUpperCase();
    if (cur !== "ALL" && !wanted.has(cur)) continue;
    const dist = Math.abs(ev.eventTimeUtc.getTime() - now.getTime());
    if (dist <= windowMs) return { blocked: true, event: ev };
  }
  return { blocked: false };
}

// ── Staleness + fail-safe (VCH-RSK-06c) ──────────────────────────────────────

export const CALENDAR_STALE_HOURS = 48;

export function isCacheStale(
  newestFetchedAt: Date | null,
  now: Date,
  maxAgeHours: number = CALENDAR_STALE_HOURS
): boolean {
  if (!newestFetchedAt) return true;
  return now.getTime() - newestFetchedAt.getTime() > maxAgeHours * 3_600_000;
}

/**
 * Conservative default blocks when calendar data is unavailable:
 * typical US data releases (13:30 UTC) and FOMC (19:00 UTC), weekdays.
 * Configurable constants — UTC minutes-of-day.
 */
export const FAILSAFE_WINDOWS_UTC: readonly { startMin: number; endMin: number }[] = [
  { startMin: 13 * 60 + 25, endMin: 13 * 60 + 40 }, // 13:25–13:40 UTC
  { startMin: 18 * 60 + 55, endMin: 19 * 60 + 10 }, // 18:55–19:10 UTC
];

/** Whether to fail-safe-block accounts WITHOUT an active prop profile. */
export const FAILSAFE_BLOCKS_NON_PROP = false;

/** Is `now` inside a conservative fail-safe window (weekdays only)? */
export function isInFailSafeWindow(
  now: Date,
  windows: readonly { startMin: number; endMin: number }[] = FAILSAFE_WINDOWS_UTC
): boolean {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false; // weekend
  const minOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
  return windows.some((w) => minOfDay >= w.startMin && minOfDay <= w.endMin);
}
