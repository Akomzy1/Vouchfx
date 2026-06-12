export type Plan = "trial" | "starter" | "pro" | "funded" | "lifetime";

export interface PlanEntitlements {
  maxBrokerAccounts: number;  // 0 = unlimited
  maxSignalsPerDay:  number;  // 0 = unlimited; 1 for trial
  propFirmFeatures:  boolean; // drawdown guardian, news filter, stealth (Phase 2)
  propModeEngine:    boolean; // Funded only — Phase 2 rule engine
  priorityExecution: boolean; // Pro / Funded / Lifetime
}

const TABLE: Record<Plan, PlanEntitlements> = {
  trial:    { maxBrokerAccounts: 1,  maxSignalsPerDay: 1,  propFirmFeatures: false, propModeEngine: false, priorityExecution: false },
  starter:  { maxBrokerAccounts: 1,  maxSignalsPerDay: 0,  propFirmFeatures: false, propModeEngine: false, priorityExecution: false },
  pro:      { maxBrokerAccounts: 3,  maxSignalsPerDay: 0,  propFirmFeatures: true,  propModeEngine: false, priorityExecution: true  },
  funded:   { maxBrokerAccounts: 10, maxSignalsPerDay: 0,  propFirmFeatures: true,  propModeEngine: true,  priorityExecution: true  },
  lifetime: { maxBrokerAccounts: 3,  maxSignalsPerDay: 0,  propFirmFeatures: true,  propModeEngine: false, priorityExecution: true  },
};

export function getEntitlements(plan: Plan | null | undefined): PlanEntitlements {
  return TABLE[plan ?? "trial"];
}

export type SubscriptionStatus =
  | "trialing" | "active" | "past_due" | "cancelled" | "expired";

/** Returns true if the subscription allows signal execution. */
export function canExecute(
  plan: Plan | null | undefined,
  status: SubscriptionStatus | null | undefined
): boolean {
  if (!status) return false;
  if (status === "trialing" || status === "active") return true;
  // past_due: grace period — allow execution but prompt user
  if (status === "past_due") return true;
  return false;
}

/**
 * Returns true if the plan includes the Prop Mode rule engine.
 * This is the single place to update when PRD R11 introduces a dedicated Prop tier.
 */
export function canUsePropMode(plan: Plan | null | undefined): boolean {
  return getEntitlements(plan).propModeEngine;
}

/** Labels for UI display. */
export const PLAN_LABELS: Record<Plan, string> = {
  trial:    "Free trial",
  starter:  "Starter",
  pro:      "Pro",
  funded:   "Funded",
  lifetime: "Lifetime",
};

export const PLAN_PRICES: Record<Plan, string> = {
  trial:    "Free",
  starter:  "$19 / mo",
  pro:      "$39 / mo",
  funded:   "$79 / mo",
  lifetime: "$399 once",
};

/**
 * Canonical USD price per plan — the source of truth for money math
 * (e.g. affiliate commission on Paystack NGN charges, where converting the
 * charged kobo via a live FX rate would make commissions drift with the
 * market). Keep in sync with PLAN_PRICES above.
 */
export const PLAN_USD_PRICE: Record<Plan, number> = {
  trial:    0,
  starter:  19,
  pro:      39,
  funded:   79,
  lifetime: 399,
};
