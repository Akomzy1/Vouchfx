/**
 * Broker-specific symbol variant map.
 *
 * When resolveSymbol() receives a canonical symbol (e.g. XAUUSD), it tries
 * each variant in order until one is confirmed to exist on the broker.
 * Variants are ordered by prevalence across common retail brokers.
 *
 * Expanded per-broker in P1.11 (BRK-03). For the spike, this covers the
 * most common patterns.
 */
export const SYMBOL_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  // ── Metals ──────────────────────────────────────────────────────────────────
  XAUUSD: ["XAUUSD", "GOLD", "XAUUSDm", "XAUUSD.m", "XAUUSD+", "XAUUSDpro"],
  XAGUSD: ["XAGUSD", "SILVER", "XAGUSDm", "XAGUSD.m"],

  // ── Energy ───────────────────────────────────────────────────────────────────
  USOIL:  ["USOIL", "OIL", "WTI", "XTIUSD", "CL", "USCrude"],
  UKOIL:  ["UKOIL", "BRENT", "XBRUSD", "UKCrude"],
  NGAS:   ["NGAS", "NATGAS", "XNGUSD"],

  // ── Indices ──────────────────────────────────────────────────────────────────
  US30:   ["US30", "DJ30", "DJIA", "WallSt30", "US30.cash"],
  US100:  ["US100", "NAS100", "NASDAQ", "NDX", "Nasdaq100", "US100.cash"],
  US500:  ["US500", "SPX500", "SP500", "S&P500", "US500.cash"],
  GER40:  ["GER40", "DAX", "GER30", "DE30", "GER40.cash"],
  UK100:  ["UK100", "FTSE100", "FTSE", "UK100.cash"],
  FRA40:  ["FRA40", "CAC40", "CAC", "FRA40.cash"],
  JPN225: ["JPN225", "JP225", "NIKKEI", "Nikkei225"],
  AUS200: ["AUS200", "ASX200", "AUS200.cash"],

  // ── Crypto ───────────────────────────────────────────────────────────────────
  BTCUSD: ["BTCUSD", "BTC/USD", "BITCOIN", "XBTUSD"],
  ETHUSD: ["ETHUSD", "ETH/USD", "ETHEREUM"],
  BNBUSD: ["BNBUSD", "BNB/USD"],
  SOLUSD: ["SOLUSD", "SOL/USD"],
  XRPUSD: ["XRPUSD", "XRP/USD"],
};

/** Upper-case and drop separators so "XAUUSD.c" and "XAUUSD" compare equal. */
function normalizeSymbol(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Broker suffix tokens appended to a base symbol (account-type / feed variants).
// Stripped only ONE token from the END, so EURUSD→EURUSDT is NOT mistaken for
// EURUSD (T is not a known suffix); XAUUSD.c → XAUUSDC → XAUUSD (C is).
const BROKER_SUFFIX_RE = /(MICRO|MINI|CASH|SPOT|SPREAD|ECN|PRO|RAW|STD|PLUS)$|([MCISRZ])$/;

function stripBrokerSuffix(n: string): string {
  return n.replace(BROKER_SUFFIX_RE, "");
}

/**
 * Generic broker-symbol resolver (VCH-BRK-03 gold/suffix auto-detection).
 *
 * Given a canonical symbol, its known variants, and the broker's FULL symbol
 * list, find the broker's actual symbol — handling arbitrary suffix/format
 * differences (XAUUSD.c, XAUUSDmicro, GOLD., XAUUSD_i, …) the static list can't
 * enumerate. Conservative to avoid false matches: exact normalized match first,
 * then "base + one known suffix" (shortest wins). Returns null if nothing fits.
 */
export function resolveBrokerSymbol(
  raw: string,
  variants: readonly string[],
  brokerSymbols: readonly string[]
): string | null {
  const bases = Array.from(new Set([raw, ...variants].map(normalizeSymbol)));
  const list = brokerSymbols.map((s) => ({ raw: s, n: normalizeSymbol(s) }));

  // 1. Exact normalized match to the canonical or a known variant.
  for (const base of bases) {
    const hit = list.find((x) => x.n === base);
    if (hit) return hit.raw;
  }
  // 2. Broker symbol == base + one known suffix token (prefer the shortest,
  //    i.e. the plainest variant).
  let best: { raw: string; n: string } | null = null;
  for (const x of list) {
    const stripped = stripBrokerSuffix(x.n);
    if (stripped !== x.n && bases.includes(stripped)) {
      if (!best || x.n.length < best.n.length) best = x;
    }
  }
  return best ? best.raw : null;
}
