import { describe, it, expect } from "vitest";
import {
  getEntitlements,
  canUsePropMode,
  canExecute,
  PLAN_LABELS,
  PLAN_PRICES,
} from "../entitlements";
import type { Plan } from "../entitlements";

// ── canUsePropMode ────────────────────────────────────────────────────────────
// This is the single entitlement gate between UI/API and the Prop Mode engine.
// PRD §11: Funded tier only. PRD R11 (future Prop-tier pricing) is the sole
// reason the gate lives in one function rather than inline comparisons.

describe("canUsePropMode", () => {
  it("trial → false", () => expect(canUsePropMode("trial")).toBe(false));
  it("starter → false", () => expect(canUsePropMode("starter")).toBe(false));
  it("pro → false", () => expect(canUsePropMode("pro")).toBe(false));
  it("funded → true", () => expect(canUsePropMode("funded")).toBe(true));
  it("lifetime → false (lifetime is Pro-level, not Funded)", () => {
    expect(canUsePropMode("lifetime")).toBe(false);
  });
  it("null (no subscription row) → false", () => {
    expect(canUsePropMode(null)).toBe(false);
  });
  it("undefined (plan unknown) → false", () => {
    expect(canUsePropMode(undefined)).toBe(false);
  });
  it("only funded has propModeEngine in the entitlement table", () => {
    const plans: Plan[] = ["trial", "starter", "pro", "funded", "lifetime"];
    const withPropMode = plans.filter((p) => getEntitlements(p).propModeEngine);
    expect(withPropMode).toEqual(["funded"]);
  });
});

// ── propFirmFeatures (drawdown guardian, news filter, stealth) ────────────────
// Available on Pro, Funded, Lifetime — NOT on Starter or Trial.

describe("propFirmFeatures", () => {
  it("trial → false", () => expect(getEntitlements("trial").propFirmFeatures).toBe(false));
  it("starter → false", () => expect(getEntitlements("starter").propFirmFeatures).toBe(false));
  it("pro → true", () => expect(getEntitlements("pro").propFirmFeatures).toBe(true));
  it("funded → true", () => expect(getEntitlements("funded").propFirmFeatures).toBe(true));
  it("lifetime → true", () => expect(getEntitlements("lifetime").propFirmFeatures).toBe(true));
});

// ── Broker account limits ─────────────────────────────────────────────────────

describe("maxBrokerAccounts", () => {
  it("trial → 1", () => expect(getEntitlements("trial").maxBrokerAccounts).toBe(1));
  it("starter → 1", () => expect(getEntitlements("starter").maxBrokerAccounts).toBe(1));
  it("pro → 3", () => expect(getEntitlements("pro").maxBrokerAccounts).toBe(3));
  it("funded → 10", () => expect(getEntitlements("funded").maxBrokerAccounts).toBe(10));
  it("lifetime → 3", () => expect(getEntitlements("lifetime").maxBrokerAccounts).toBe(3));
});

// ── Signal limits ─────────────────────────────────────────────────────────────

describe("maxSignalsPerDay", () => {
  it("trial → 1 (hard cap)", () => expect(getEntitlements("trial").maxSignalsPerDay).toBe(1));
  it("paid plans → 0 (unlimited)", () => {
    for (const plan of ["starter", "pro", "funded", "lifetime"] as Plan[]) {
      expect(getEntitlements(plan).maxSignalsPerDay).toBe(0);
    }
  });
});

// ── canExecute ────────────────────────────────────────────────────────────────

describe("canExecute", () => {
  it("trialing status → true", () => {
    expect(canExecute("trial", "trialing")).toBe(true);
  });
  it("active status → true", () => {
    expect(canExecute("pro", "active")).toBe(true);
  });
  it("past_due → true (grace period)", () => {
    expect(canExecute("pro", "past_due")).toBe(true);
  });
  it("cancelled → false", () => {
    expect(canExecute("pro", "cancelled")).toBe(false);
  });
  it("expired → false", () => {
    expect(canExecute("trial", "expired")).toBe(false);
  });
  it("null status → false", () => {
    expect(canExecute("funded", null)).toBe(false);
  });
});

// ── Label / price tables completeness ────────────────────────────────────────

describe("PLAN_LABELS and PLAN_PRICES", () => {
  const plans: Plan[] = ["trial", "starter", "pro", "funded", "lifetime"];

  it("PLAN_LABELS has an entry for every plan", () => {
    for (const p of plans) expect(PLAN_LABELS[p]).toBeTruthy();
  });

  it("PLAN_PRICES has an entry for every plan", () => {
    for (const p of plans) expect(PLAN_PRICES[p]).toBeTruthy();
  });
});
