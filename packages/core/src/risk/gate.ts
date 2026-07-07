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
    // apply_default: convert the asset-appropriate default pips to a price
    // distance and place the stop on the correct side of entry (below for BUY,
    // above for SELL). Gold uses its own (wider) default.
    const defaultPips = isGoldSymbol(input.symbol) ? settings.defaultSlPipsGold : settings.defaultSlPips;
    slDistancePrice = defaultPips * pipSizeFor(input.symbol, spec);
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
