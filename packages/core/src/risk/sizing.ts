import type { SymbolSpec, RiskSettings } from "./types";

/** Round `volume` down to the nearest multiple of `step`. */
export function roundToStep(volume: number, step: number): number {
  if (step <= 0) return volume;
  return Math.floor(volume / step + Number.EPSILON) * step;
}

/** Clamp volume to [spec.volumeMin, spec.volumeMax]. Returns 0 if min > max (invalid spec). */
export function clampVolume(volume: number, spec: SymbolSpec): number {
  if (spec.volumeMin > spec.volumeMax) return 0;
  return Math.max(spec.volumeMin, Math.min(spec.volumeMax, volume));
}

export interface ComputeVolumeInput {
  accountBalance: number;
  /** Absolute SL distance in price units (output of resolveSlDistance). */
  slDistancePrice: number;
  settings: RiskSettings;
  spec: SymbolSpec;
}

export interface ComputeVolumeResult {
  volume: number;
  /** Dollar amount at risk for this lot size, given the SL distance. */
  dollarRisk: number;
}

/**
 * Compute the lot volume to use for a single-leg trade.
 *
 * Formula (percent_balance / fixed_dollar_risk):
 *   valuePerLot = (slDistance / tickSize) * tickValue
 *   volume = riskAmount / valuePerLot
 *
 * For fixed_lot the slDistancePrice and spec are still used to report dollarRisk.
 */
export function computeVolume(input: ComputeVolumeInput): ComputeVolumeResult {
  const { accountBalance, slDistancePrice, settings, spec } = input;

  if (!isFinite(slDistancePrice) || slDistancePrice <= 0) {
    return { volume: 0, dollarRisk: 0 };
  }

  const valuePerLot = (slDistancePrice / spec.tickSize) * spec.tickValue;

  if (!isFinite(valuePerLot) || valuePerLot <= 0) {
    return { volume: 0, dollarRisk: 0 };
  }

  let rawVolume: number;

  switch (settings.mode) {
    case "percent_balance": {
      const riskAmount = accountBalance * (settings.riskPercent / 100);
      rawVolume = riskAmount / valuePerLot;
      break;
    }
    case "fixed_dollar_risk": {
      rawVolume = settings.fixedDollarRisk / valuePerLot;
      break;
    }
    case "fixed_lot": {
      rawVolume = settings.fixedLot;
      break;
    }
  }

  const stepped = roundToStep(rawVolume, spec.volumeStep);
  const volume = clampVolume(stepped, spec);
  const dollarRisk = volume * valuePerLot;

  return { volume, dollarRisk };
}
