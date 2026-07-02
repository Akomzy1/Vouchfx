/**
 * Follow-up level modification — pure logic (VCH-PRS-07).
 *
 * A provider often sends BOTH levels in one follow-up ("SL 3350 TP 3280"), but
 * the classifier emits a single follow_up_type (MODIFY_SL or MODIFY_TP). The
 * executor must apply every level present in the message — classifying as
 * MODIFY_SL must not silently drop the TP, and vice versa.
 */

export interface ModifyLevels {
  sl?: number;
  tp?: number;
}

function validPrice(n: number | null | undefined): n is number {
  return n != null && isFinite(n) && n > 0;
}

/**
 * Level changes to apply to leg `legIndex` for a MODIFY_SL / MODIFY_TP
 * follow-up. Multiple TPs assign round-robin across legs (multi-TP signals
 * have one leg per TP). Returns null when the message carries no usable value
 * for the CLASSIFIED type — the classification promises that field, so its
 * absence means the parse is unusable, even if the other level is present.
 */
export function buildModifyChanges(
  followUpType: "MODIFY_SL" | "MODIFY_TP",
  sl: number | null | undefined,
  tps: readonly number[],
  legIndex: number
): ModifyLevels | null {
  const hasSl = validPrice(sl);
  const validTps = tps.filter(validPrice);
  const hasTp = validTps.length > 0;

  if (followUpType === "MODIFY_SL" && !hasSl) return null;
  if (followUpType === "MODIFY_TP" && !hasTp) return null;

  const changes: ModifyLevels = {};
  if (hasSl) changes.sl = sl;
  if (hasTp) changes.tp = validTps[legIndex % validTps.length]!;
  return changes;
}
