// Claude model routing — see CLAUDE.md §5.
// Escalate only as needed; Haiku handles the vast majority of signals.
export const MODELS = {
  /** Default: fast, cheap, text-only well-formed signals */
  default: "claude-haiku-4-5-20251001",
  /** Fallback: vision / multilingual / confidence < threshold */
  fallback: "claude-sonnet-4-6",
  /** Hard cases: new-channel learning pass, human-flagged ambiguous */
  hard: "claude-opus-4-8",
} as const;

export type ModelKey = keyof typeof MODELS;
export type ModelId = (typeof MODELS)[ModelKey];

/** Minimum confidence for a parsed signal to proceed to execution */
export const CONFIDENCE_THRESHOLD = 0.85;

/** Default daily signal limit per user (overridable in risk settings) */
export const DAILY_SIGNAL_LIMIT_DEFAULT = 5;

/** Default per-trade risk as % of account balance */
export const PER_TRADE_RISK_PCT_DEFAULT = 0.5;

/** Number of signals to run on Opus for a newly added channel (learning pass) */
export const NEW_CHANNEL_OPUS_SIGNALS = 5;

/** Minimum payout balance threshold for affiliate payouts (USD) */
export const AFFILIATE_PAYOUT_MINIMUM_USD = 50;

/** Commission rate for both referral programs (20%) */
export const COMMISSION_RATE = 0.2;

/** Free trial duration in days */
export const FREE_TRIAL_DAYS = 7;

/** Free trial daily signal cap (system-locked, not user-configurable) */
export const FREE_TRIAL_SIGNAL_LIMIT = 1;
