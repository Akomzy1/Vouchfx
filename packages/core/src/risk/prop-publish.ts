/**
 * Prop rule publishing — pure classification logic (VCH-PROP-12, 13).
 *
 * Classifies a set of changed ruleset fields as "critical" (always requires
 * human approval) or "low_stakes" (eligible for auto-publish at high confidence).
 *
 * Account-killing fields: changing these can invalidate a trader's funded account
 * if the rule is wrong. Always require a human approver.
 *
 * Low-stakes fields: administrative / protective parameters. A wrong value is
 * inconvenient but not account-ending. Auto-publishable at high confidence.
 */

// ── Field classifications ─────────────────────────────────────────────────────

export const ACCOUNT_KILLING_FIELDS = [
  "daily_loss_pct",
  "daily_loss_basis",
  "max_drawdown_pct",
  "max_drawdown_model",
  "consistency_pct",
  "copy_trading_permitted",
] as const;

export const LOW_STAKES_FIELDS = [
  "news_before_min",
  "news_after_min",
  "weekend_holding_allowed",
  "min_trading_days",
] as const;

export type AccountKillingField = (typeof ACCOUNT_KILLING_FIELDS)[number];
export type LowStakesField = (typeof LOW_STAKES_FIELDS)[number];
export type ProposalStakes = "critical" | "low_stakes";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum confidence for a proposal to be created at all (checked in rule monitor). */
export const PROPOSAL_CONFIDENCE_THRESHOLD = 0.6;

/** Minimum confidence for a low-stakes change to auto-publish without approval. */
export const AUTO_PUBLISH_CONFIDENCE = 0.85;

// ── Pure classifiers ──────────────────────────────────────────────────────────

/**
 * Returns "critical" if any changed field can invalidate a funded account.
 * Returns "low_stakes" only when ALL changed fields are administrative.
 */
export function classifyProposalStakes(changedFields: string[]): ProposalStakes {
  for (const f of changedFields) {
    if ((ACCOUNT_KILLING_FIELDS as readonly string[]).includes(f)) {
      return "critical";
    }
  }
  return "low_stakes";
}

/**
 * Returns true when ALL of the following hold:
 *   1. No account-killing field is in changedFields.
 *   2. Agent confidence >= AUTO_PUBLISH_CONFIDENCE.
 */
export function isAutoPublishEligible(changedFields: string[], confidence: number): boolean {
  return (
    classifyProposalStakes(changedFields) === "low_stakes" &&
    confidence >= AUTO_PUBLISH_CONFIDENCE
  );
}

/** Human-readable label for a stakes value. */
export function stakesLabel(stakes: ProposalStakes): string {
  return stakes === "critical" ? "Critical — requires approval" : "Low-stakes";
}

/**
 * Fields that should warn the approver when the new value is more permissive
 * (e.g. daily_loss_pct going up = less strict = higher risk).
 */
export function isMorePermissive(
  field: string,
  oldVal: unknown,
  newVal: unknown,
): boolean {
  const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v)));
  switch (field) {
    case "daily_loss_pct":
    case "max_drawdown_pct":
    case "consistency_pct":
      return num(newVal) > num(oldVal);
    case "news_before_min":
    case "news_after_min":
    case "min_trading_days":
      return num(newVal) < num(oldVal);
    case "weekend_holding_allowed":
      return newVal === true && oldVal === false;
    case "copy_trading_permitted":
      // Switching from false to true is MORE permissive.
      return newVal === true && oldVal === false;
    default:
      return false;
  }
}
