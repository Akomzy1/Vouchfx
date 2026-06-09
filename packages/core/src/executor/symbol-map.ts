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
  UKOIL:  ["UKOIL", "BRENT", "XBTUSD", "UKCrude"],
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
