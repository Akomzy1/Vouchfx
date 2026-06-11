/**
 * Prop timing guards — VCH-PROP-06, VCH-PROP-07.
 *
 * Three pure checks:
 *   isInNewsWindow      — is the current moment within the firm's exact news window?
 *   isWeekendRisk       — does placing a trade now risk holding over the weekend?
 *   checkMinTradingDays — has the account met the minimum trading-days requirement?
 *
 * Each function is stateless and testable without mocking time (callers pass timestamps).
 */

// ── News window ───────────────────────────────────────────────────────────────

export interface NewsEvent {
  /** UTC timestamp of the high-impact news event. */
  eventAtMs: number;
  /** Symbol currencies this event affects, e.g. ['USD', 'JPY']. */
  currencies: string[];
  impact: "high" | "medium" | "low";
}

export interface NewsWindowConfig {
  /** Minutes before the event to start blocking (from the firm's ruleset). */
  beforeMin: number;
  /** Minutes after the event to resume (from the firm's ruleset). */
  afterMin: number;
}

/**
 * Returns true if `nowMs` falls inside any news exclusion window for the
 * instrument's currencies, using the firm's specific before/after minutes.
 */
export function isInNewsWindow(
  nowMs: number,
  symbolCurrencies: string[],
  events: NewsEvent[],
  config: NewsWindowConfig,
): boolean {
  if (config.beforeMin === 0 && config.afterMin === 0) return false;
  const before = config.beforeMin * 60 * 1000;
  const after  = config.afterMin  * 60 * 1000;

  return events.some((ev) => {
    if (ev.impact !== "high") return false;
    if (!ev.currencies.some((c) => symbolCurrencies.includes(c))) return false;
    return nowMs >= ev.eventAtMs - before && nowMs <= ev.eventAtMs + after;
  });
}

// ── Weekend risk ──────────────────────────────────────────────────────────────

/**
 * Returns true when placing a trade NOW would likely result in holding over the
 * weekend, given the firm's `weekend_holding_allowed = false` rule.
 *
 * "Weekend risk" is defined as: the current time is within `bufferMinutes` of
 * Friday's market-close (23:59 UTC Friday) OR it is already Saturday/Sunday.
 *
 * @param nowMs          Current UTC timestamp.
 * @param bufferMinutes  How many minutes before Friday close to start blocking.
 *                       Default: 60 (1 hour).
 */
export function isWeekendRisk(nowMs: number, bufferMinutes = 60): boolean {
  const d = new Date(nowMs);
  const dow = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat

  if (dow === 6 || dow === 0) return true; // Saturday or Sunday

  if (dow === 5) {
    // Friday: block if within bufferMinutes of 23:59 UTC
    const fridayCloseMs = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      0,
    );
    return nowMs >= fridayCloseMs - bufferMinutes * 60 * 1000;
  }

  return false;
}

// ── Minimum trading days ──────────────────────────────────────────────────────

export interface MinTradingDaysStatus {
  required: number;
  completed: number;
  remaining: number;
  met: boolean;
  reason: string | null;
}

/**
 * Determine whether the account has satisfied the minimum-trading-days
 * requirement.
 *
 * A "trading day" is a UTC calendar day on which at least one trade was placed
 * (or a prop_daily_pnl row exists with trade_count > 0).
 *
 * @param tradingDayKeys  Array of 'YYYY-MM-DD' UTC keys on which trades occurred.
 * @param minTradingDays  Required minimum (from the firm's ruleset).
 */
export function checkMinTradingDays(
  tradingDayKeys: string[],
  minTradingDays: number,
): MinTradingDaysStatus {
  if (minTradingDays === 0) {
    return { required: 0, completed: 0, remaining: 0, met: true, reason: null };
  }

  const unique = new Set(tradingDayKeys);
  const completed = unique.size;
  const remaining = Math.max(0, minTradingDays - completed);
  const met = completed >= minTradingDays;

  return {
    required: minTradingDays,
    completed,
    remaining,
    met,
    reason: met
      ? null
      : `${remaining} more trading day${remaining === 1 ? "" : "s"} required to meet the minimum of ${minTradingDays}`,
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Extract the two ISO 4217 currency codes from a Forex symbol or commodity alias.
 * Returns e.g. ['XAU', 'USD'] for XAUUSD, ['EUR', 'USD'] for EURUSD.
 * Returns [] for indices/synthetics that carry no currency risk.
 */
export function symbolCurrencies(symbol: string): string[] {
  const s = symbol.toUpperCase().replace(/[._].*$/, "").replace(/^(FX:|FX)/, "");

  // Known commodity aliases
  const commodities: Record<string, string[]> = {
    XAUUSD: ["XAU", "USD"],
    XAGUSD: ["XAG", "USD"],
    XTIUSD: ["OIL", "USD"],
    XBRUSD: ["OIL", "USD"],
    XAUEUR: ["XAU", "EUR"],
  };
  if (commodities[s]) return commodities[s];

  // Standard 6-char forex pair
  if (/^[A-Z]{6}$/.test(s)) {
    return [s.slice(0, 3), s.slice(3, 6)];
  }

  return [];
}
