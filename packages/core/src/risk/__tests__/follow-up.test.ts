import { describe, it, expect } from "vitest";
import { buildModifyChanges } from "../follow-up";

/**
 * Combined SL+TP follow-ups (VCH-PRS-07): "SL 3350 TP 3280" in ONE message
 * classifies as a single follow_up_type, but BOTH levels must be applied —
 * neither may be silently dropped.
 */

describe("buildModifyChanges — single-level messages (existing behaviour)", () => {
  it("MODIFY_SL with only an SL applies just the SL", () => {
    expect(buildModifyChanges("MODIFY_SL", 3350, [], 0)).toEqual({ sl: 3350 });
  });

  it("MODIFY_TP with only TPs applies just the TP", () => {
    expect(buildModifyChanges("MODIFY_TP", null, [3280], 0)).toEqual({ tp: 3280 });
  });

  it("MODIFY_TP assigns multiple TPs round-robin across legs", () => {
    const tps = [3280, 3250];
    expect(buildModifyChanges("MODIFY_TP", null, tps, 0)!.tp).toBe(3280);
    expect(buildModifyChanges("MODIFY_TP", null, tps, 1)!.tp).toBe(3250);
    expect(buildModifyChanges("MODIFY_TP", null, tps, 2)!.tp).toBe(3280); // wraps
  });
});

describe("buildModifyChanges — combined SL+TP in one message (the fix)", () => {
  it("MODIFY_SL carrying a TP applies BOTH levels", () => {
    expect(buildModifyChanges("MODIFY_SL", 3350, [3280], 0)).toEqual({ sl: 3350, tp: 3280 });
  });

  it("MODIFY_TP carrying an SL applies BOTH levels", () => {
    expect(buildModifyChanges("MODIFY_TP", 3350, [3280], 0)).toEqual({ sl: 3350, tp: 3280 });
  });

  it("combined message with multi-TP: SL shared, TPs round-robin", () => {
    expect(buildModifyChanges("MODIFY_SL", 3350, [3280, 3250], 0)).toEqual({ sl: 3350, tp: 3280 });
    expect(buildModifyChanges("MODIFY_SL", 3350, [3280, 3250], 1)).toEqual({ sl: 3350, tp: 3250 });
  });
});

describe("buildModifyChanges — the classified field must be present", () => {
  it("MODIFY_SL without an SL is unusable, even when TPs exist", () => {
    expect(buildModifyChanges("MODIFY_SL", null, [3280], 0)).toBeNull();
  });

  it("MODIFY_TP without TPs is unusable, even when an SL exists", () => {
    expect(buildModifyChanges("MODIFY_TP", 3350, [], 0)).toBeNull();
  });

  it("invalid values (zero / NaN / negative) count as absent", () => {
    expect(buildModifyChanges("MODIFY_SL", 0, [], 0)).toBeNull();
    expect(buildModifyChanges("MODIFY_SL", NaN, [], 0)).toBeNull();
    expect(buildModifyChanges("MODIFY_TP", null, [-1, NaN], 0)).toBeNull();
    // A valid TP among invalid ones still works
    expect(buildModifyChanges("MODIFY_TP", null, [NaN, 3280], 0)).toEqual({ tp: 3280 });
  });
});
