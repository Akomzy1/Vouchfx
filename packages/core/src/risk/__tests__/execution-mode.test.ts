/**
 * Execution mode tests — VCH-RSK-09..12
 *
 * Covers:
 *   1. Mirror mode preserves provider SL price unchanged.
 *   2. No SL + mirrorAllowNoSl=false → skip-with-reason "mirror:no_sl_no_ack".
 *   3. No SL + mirrorAllowNoSl=true → executes with slPrice = null.
 *   4. mirror_lot_mode sub-choices: provider_lot, fixed_lot, risk_based.
 *   5. provider_lot falls back to risk_based when no lot stated in signal.
 *   6. Hard caps (daily signal limit, max trades, daily loss cap) are upstream of
 *      gateAndSize — verified by confirming gateAndSize result shape is intact for
 *      cap-enforcement callers.
 *   7. apply_my_rules mode: no-SL policy=skip still works normally.
 */

import { describe, it, expect } from "vitest";
import { gateAndSize } from "../gate";
import type { GateInput } from "../gate";
import type { RiskSettings, SymbolSpec } from "../types";
import { DEFAULT_RISK_SETTINGS } from "../types";

// ── Test fixtures ─────────────────────────────────────────────────────────────

// EURUSD-like spec: 5-decimal, USD account
// tickValue = tickSize * contractSize = 0.00001 * 100000 = 1 USD per tick per lot
const SPEC: SymbolSpec = {
  symbol:       "EURUSD",
  contractSize: 100_000,
  tickSize:     0.00001,
  tickValue:    1,         // 1 USD per pip per lot
  volumeStep:   0.01,
  volumeMin:    0.01,
  volumeMax:    100,
};

// Baseline: BUY at 1.0850, SL at 1.0800 → 50 pip distance → 500 USD/lot
// 1% of $10k = $100 risk → volume = 100/500 = 0.20 lots
const ENTRY = 1.0850;
const SL    = 1.0800;
const BALANCE = 10_000;

const MIRROR_SETTINGS: RiskSettings = {
  ...DEFAULT_RISK_SETTINGS,
  executionMode:  "mirror_provider",
  mirrorLotMode:  "risk_based",
  mirrorAllowNoSl: false,
  mode:            "percent_balance",
  riskPercent:     1,  // 1%
};

const BASE: GateInput = {
  sl:             SL,
  slUnit:         "price",
  entryPrice:     ENTRY,
  side:           "BUY",
  accountBalance: BALANCE,
  settings:       MIRROR_SETTINGS,
  spec:           SPEC,
};

// ── 1. Mirror mode preserves provider SL ─────────────────────────────────────

describe("mirror mode — provider SL preserved", () => {
  it("slPrice in result equals the provider SL, not a computed default", () => {
    const r = gateAndSize(BASE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.slPrice).toBe(SL);
  });

  it("returns a positive volume and non-negative dollarRisk", () => {
    const r = gateAndSize(BASE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.volume).toBeGreaterThan(0);
      expect(r.dollarRisk).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── 2. No SL + mirrorAllowNoSl=false → skip ───────────────────────────────────

describe("mirror mode — no SL, not acknowledged", () => {
  it("skips with reason mirror:no_sl_no_ack", () => {
    const r = gateAndSize({ ...BASE, sl: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("mirror:no_sl_no_ack");
  });

  it("also skips when sl=0", () => {
    const r = gateAndSize({ ...BASE, sl: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("mirror:no_sl_no_ack");
  });
});

// ── 3. No SL + mirrorAllowNoSl=true → executes ───────────────────────────────

describe("mirror mode — no SL, explicitly allowed", () => {
  const settings: RiskSettings = { ...MIRROR_SETTINGS, mirrorAllowNoSl: true };

  it("ok=true with slPrice=null", () => {
    const r = gateAndSize({ ...BASE, sl: null, settings });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.slPrice).toBeNull();
  });

  it("dollarRisk is 0 when there is no SL to measure from", () => {
    const r = gateAndSize({ ...BASE, sl: null, settings });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dollarRisk).toBe(0);
  });

  it("uses fixedLot as volume when no SL is available for risk-based sizing", () => {
    // settings.fixedLot default = 0.01
    const r = gateAndSize({ ...BASE, sl: null, settings });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.volume).toBe(DEFAULT_RISK_SETTINGS.fixedLot);
  });
});

// ── 4. mirror_lot_mode: provider_lot ─────────────────────────────────────────

describe("mirror mode — provider_lot sub-choice", () => {
  const settings: RiskSettings = { ...MIRROR_SETTINGS, mirrorLotMode: "provider_lot" };

  it("uses providerLot when stated", () => {
    const r = gateAndSize({ ...BASE, settings, providerLot: 0.5 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.volume).toBe(0.5);
  });

  it("providerLot is stepped to volumeStep", () => {
    // 0.333 → floor to 0.33 (step=0.01)
    const r = gateAndSize({ ...BASE, settings, providerLot: 0.333 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.volume).toBeCloseTo(0.33, 2);
  });

  it("falls back to risk_based when providerLot is null", () => {
    // 1% of 10000 = 100 USD; SL dist = 0.005 price → 500 USD/lot → 0.20 lots
    const r = gateAndSize({ ...BASE, settings, providerLot: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.volume).toBeCloseTo(0.20, 2);
  });

  it("falls back to risk_based when providerLot is 0", () => {
    const r = gateAndSize({ ...BASE, settings, providerLot: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.volume).toBeCloseTo(0.20, 2);
  });
});

// ── 5. mirror_lot_mode: fixed_lot ────────────────────────────────────────────

describe("mirror mode — fixed_lot sub-choice", () => {
  it("uses settings.fixedLot regardless of SL distance", () => {
    const settings: RiskSettings = {
      ...MIRROR_SETTINGS,
      mirrorLotMode: "fixed_lot",
      fixedLot: 0.25,
    };
    const r = gateAndSize({ ...BASE, settings });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.volume).toBe(0.25);
  });

  it("dollarRisk is computed from fixed lot × SL distance", () => {
    // volume=0.25; SL dist = 0.005 price → valuePerLot = (0.005/0.00001)*1 = 500
    // dollarRisk = 0.25 * 500 = 125
    const settings: RiskSettings = {
      ...MIRROR_SETTINGS,
      mirrorLotMode: "fixed_lot",
      fixedLot: 0.25,
    };
    const r = gateAndSize({ ...BASE, settings });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dollarRisk).toBeCloseTo(125, 1);
  });
});

// ── 6. mirror_lot_mode: risk_based ───────────────────────────────────────────

describe("mirror mode — risk_based sub-choice", () => {
  it("sizes from riskPercent and SL distance", () => {
    // 1% of 10000 = 100; dist=0.005; valuePerLot=500; volume=0.20
    const r = gateAndSize(BASE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.volume).toBeCloseTo(0.20, 2);
      expect(r.dollarRisk).toBeCloseTo(100, 1);
    }
  });

  it("respects volumeMax clamp", () => {
    const settings: RiskSettings = { ...MIRROR_SETTINGS, riskPercent: 50 }; // huge risk %
    const spec: SymbolSpec = { ...SPEC, volumeMax: 5 };
    const r = gateAndSize({ ...BASE, settings, spec });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.volume).toBeLessThanOrEqual(5);
  });
});

// ── 7. Hard caps: gateAndSize result shape is intact for upstream enforcement ──

describe("mirror mode — hard caps enforced upstream, gate result shape is correct", () => {
  it("returns { ok, volume, slPrice, dollarRisk } — the shape the worker needs to log", () => {
    const r = gateAndSize(BASE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(typeof r.volume).toBe("number");
      expect(typeof r.dollarRisk).toBe("number");
      // slPrice is number | null
      expect(r.slPrice === null || typeof r.slPrice === "number").toBe(true);
    }
  });
});

// ── 8. apply_my_rules mode — unchanged behaviour ──────────────────────────────

describe("apply_my_rules mode — existing behaviour preserved", () => {
  const applySettings: RiskSettings = {
    ...DEFAULT_RISK_SETTINGS,
    executionMode:   "apply_my_rules",
    mirrorLotMode:   "risk_based",
    mirrorAllowNoSl: false,
    mode:            "percent_balance",
    riskPercent:     1,
    defaultSlPolicy: "skip",
  };

  it("no SL + policy=skip → skip-with-reason no_sl:policy=skip", () => {
    const r = gateAndSize({ ...BASE, sl: null, settings: applySettings });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_sl:policy=skip");
  });

  it("with SL → normal risk-based sizing", () => {
    const r = gateAndSize({ ...BASE, settings: applySettings });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.volume).toBeCloseTo(0.20, 2);
      expect(r.slPrice).toBe(SL);
    }
  });

  it("no_sl:policy=ask returned for ask policy", () => {
    const r = gateAndSize({
      ...BASE,
      sl: null,
      settings: { ...applySettings, defaultSlPolicy: "ask" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_sl:policy=ask");
  });
});
