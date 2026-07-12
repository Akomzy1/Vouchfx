import type { RiskSettings, SymbolSpec } from "./types";
import { resolveSlDistance, pipSizeFor, type SlUnit } from "./sl-resolve";
import { computeVolume, roundToStep, clampVolume } from "./sizing";

export interface GateInput {
  /** Signal SL value (null if absent). */
  sl: number | null;
  slUnit: SlUnit;
  entryPrice: number;
  /** Trade direction — needed to place a default SL on the correct side of entry. */
  side: "BUY" | "SELL";
  /** Symbol — selects the gold vs forex default-SL distance for apply_default. */
  symbol: string;
  accountBalance: number;
  settings: RiskSettings;
  spec: SymbolSpec;
  /** Lot size explicitly stated in the signal. Only used in mirror mode with provider_lot sub-choice. */
  providerLot?: number | null;
}

/** Gold/metals need a far wider default stop than forex (XAUUSD, XAGUSD, "GOLD"). */
export function isGoldSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return s.includes("XAU") || s.includes("XAG") || s.includes("GOLD");
}

/**
 * Crypto CFDs: "pips" is not a meaningful unit for these symbols. Broker quote
 * digits put a BTC "pip" at $0.01–$0.10, so a 20-pip default SL is a ~$0.20
 * stop on a six-figure asset — below every broker's minimum stop distance
 * (order rejected: "Invalid stops"), and the near-zero SL distance blows the
 * risk-based volume up to the broker's max-lot cap. Default stops for crypto
 * are therefore sized as a PERCENT of entry price, like signal percent-SLs.
 */
export function isCryptoSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return ["BTC", "XBT", "ETH", "SOL", "XRP", "BNB", "LTC", "DOGE", "ADA"].some((t) =>
    s.includes(t)
  );
}

/** Default-SL distance for crypto as a percent of entry (≈$1,200 on BTC at $120k). */
export const CRYPTO_DEFAULT_SL_PERCENT = 1.0;

export type GateResult =
  | { ok: true; volume: number; slPrice: number | null; dollarRisk: number }
  | { ok: false; reason: string };

/**
 * Compute lot volume and dollar risk for mirror mode.
 * slDist is null when the signal has no SL (allowed when mirrorAllowNoSl=true).
 */
function computeMirrorVolume(
  input: GateInput,
  slDist: number | null
): { volume: number; dollarRisk: number } {
  const { accountBalance, settings, spec } = input;
  const validSlDist = slDist !== null && isFinite(slDist) && slDist > 0;

  const dollarRiskFromVol = (vol: number): number => {
    if (!validSlDist || vol <= 0) return 0;
    return vol * (slDist! / spec.tickSize) * spec.tickValue;
  };

  if (settings.mirrorLotMode === "fixed_lot") {
    const vol = clampVolume(roundToStep(settings.fixedLot, spec.volumeStep), spec);
    return { volume: vol, dollarRisk: dollarRiskFromVol(vol) };
  }

  if (settings.mirrorLotMode === "provider_lot") {
    const pLot = input.providerLot;
    if (pLot && isFinite(pLot) && pLot > 0) {
      const vol = clampVolume(roundToStep(pLot, spec.volumeStep), spec);
      return { volume: vol, dollarRisk: dollarRiskFromVol(vol) };
    }
    // Provider didn't state a lot — fall through to risk_based
  }

  // risk_based (also the fallback when provider_lot is absent)
  if (validSlDist) {
    return computeVolume({ accountBalance, slDistancePrice: slDist!, settings, spec });
  }
  // No SL distance (no-SL signal, mirrorAllowNoSl=true) — use fixedLot as last resort
  const vol = clampVolume(roundToStep(settings.fixedLot, spec.volumeStep), spec);
  return { volume: vol, dollarRisk: 0 };
}

/**
 * Decide whether to execute a signal and compute the lot size.
 *
 * In "apply_my_rules" mode (default):
 *   1. SL policy — if signal has no SL, apply defaultSlPolicy
 *   2. Compute volume — if 0 after rounding/clamping, skip
 *
 * In "mirror_provider" mode:
 *   1. If no SL and mirrorAllowNoSl=false → skip-with-reason
 *   2. Provider SL is preserved as-is (no default-SL substitution)
 *   3. Volume via mirrorLotMode sub-choice
 *   Hard caps (daily limits, drawdown) are enforced upstream BEFORE this call.
 */
export function gateAndSize(input: GateInput): GateResult {
  const { sl, slUnit, entryPrice, accountBalance, settings, spec } = input;

  // ── Mirror provider exactly ───────────────────────────────────────────────
  if (settings.executionMode === "mirror_provider") {
    const hasValidSl = sl !== null && isFinite(sl) && sl > 0;

    if (!hasValidSl && !settings.mirrorAllowNoSl) {
      return { ok: false, reason: "mirror:no_sl_no_ack" };
    }

    const slDist = hasValidSl
      ? resolveSlDistance(sl!, slUnit, entryPrice, spec)
      : null;

    const { volume, dollarRisk } = computeMirrorVolume(input, slDist);

    if (volume <= 0) {
      return { ok: false, reason: "volume_zero_after_sizing" };
    }

    return { ok: true, volume, slPrice: hasValidSl ? sl! : null, dollarRisk };
  }

  // ── Apply my risk rules ───────────────────────────────────────────────────
  let effectiveSl: number | null = sl;
  let slDistancePrice: number;

  if (sl === null || !isFinite(sl) || sl <= 0) {
    if (settings.defaultSlPolicy === "skip") {
      return { ok: false, reason: "no_sl:policy=skip" };
    }
    if (settings.defaultSlPolicy === "ask") {
      return { ok: false, reason: "no_sl:policy=ask" };
    }
    // apply_default: convert the asset-appropriate default distance to a price
    // distance and place the stop on the correct side of entry (below for BUY,
    // above for SELL). Gold uses its own (wider) pip default; crypto uses a
    // percent-of-price default because pips don't scale to those assets.
    if (isCryptoSymbol(input.symbol)) {
      slDistancePrice = entryPrice * (CRYPTO_DEFAULT_SL_PERCENT / 100);
    } else {
      const defaultPips = isGoldSymbol(input.symbol) ? settings.defaultSlPipsGold : settings.defaultSlPips;
      slDistancePrice = defaultPips * pipSizeFor(input.symbol, spec);
    }
    effectiveSl = input.side === "SELL"
      ? entryPrice + slDistancePrice
      : entryPrice - slDistancePrice;
  } else {
    slDistancePrice = resolveSlDistance(sl, slUnit, entryPrice, spec);
    if (!isFinite(slDistancePrice) || slDistancePrice <= 0) {
      return { ok: false, reason: "invalid_sl_distance" };
    }
  }

  const { volume, dollarRisk } = computeVolume({
    accountBalance,
    slDistancePrice,
    settings,
    spec,
  });

  if (volume <= 0) {
    return { ok: false, reason: "volume_zero_after_sizing" };
  }

  return { ok: true, volume, slPrice: effectiveSl, dollarRisk };
}
