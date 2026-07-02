/**
 * Shared request parsing for the Performance analytics API routes (PRD §6.15).
 * Every route scopes to either a specific broker account OR an account_mode —
 * demo and live are NEVER blended (VCH-PERF-05), so when neither is supplied we
 * default to "live" to match the SQL default.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidTimezone(tz: string): boolean {
  try {
    // Callable without `new`; throws RangeError for an invalid IANA zone.
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isDateString(s: string | null): s is string {
  return !!s && DATE_RE.test(s);
}

export interface Scope {
  tz: string;
  broker: string | null;
  mode: "demo" | "live" | null;
}

/** Parse the common (tz, broker, mode) scope; returns null when invalid. */
export function parseScope(sp: URLSearchParams): Scope | null {
  const tz = sp.get("tz") ?? "";
  if (!tz || !isValidTimezone(tz)) return null;

  const brokerRaw = sp.get("broker");
  const broker = brokerRaw && UUID_RE.test(brokerRaw) ? brokerRaw : null;

  const modeRaw = sp.get("mode");
  let mode: "demo" | "live" | null = modeRaw === "demo" || modeRaw === "live" ? modeRaw : null;

  // Guardrail: never leave both null — that would blend demo + live figures.
  if (!broker && !mode) mode = "live";

  return { tz, broker, mode };
}
