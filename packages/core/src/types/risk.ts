import { z } from "zod";

// ── Risk settings ──────────────────────────────────────────────────────────

export const ExecutionModeSchema = z.enum(["apply_my_rules", "mirror_provider"]);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

export const SizingModeSchema = z.enum(["pct_balance", "fixed_lot", "fixed_usd_risk"]);
export type SizingMode = z.infer<typeof SizingModeSchema>;

export const DefaultSlPolicySchema = z.enum(["apply_default", "skip", "ask"]);
export type DefaultSlPolicy = z.infer<typeof DefaultSlPolicySchema>;

export const RiskSettingsSchema = z.object({
  executionMode: ExecutionModeSchema.default("apply_my_rules"),
  sizingMode: SizingModeSchema.default("pct_balance"),
  /** Fraction of balance at risk per trade (e.g. 0.005 = 0.5%). Used in pct_balance mode. */
  riskPctPerTrade: z.number().min(0).max(1).default(0.005),
  /** Fixed lot size. Used in fixed_lot mode. */
  fixedLot: z.number().positive().optional(),
  /** Fixed $ risk per trade. Used in fixed_usd_risk mode. */
  fixedUsdRisk: z.number().positive().optional(),

  dailySignalLimit: z.number().int().positive().nullable().default(null),
  maxTradesPerDay: z.number().int().positive().nullable().default(null),
  /** Daily loss cap as a fraction of balance. null = no cap. */
  dailyLossCapPct: z.number().min(0).max(1).nullable().default(null),
  closeAllOnDailyCapHit: z.boolean().default(false),

  defaultSlPolicy: DefaultSlPolicySchema.default("skip"),
  /** Default SL distance in pips when policy = apply_default. */
  defaultSlPips: z.number().positive().optional(),

  breakevenAfterTp1: z.boolean().default(false),
  trailingAfterTp2: z.boolean().default(false),
  trailingDistancePips: z.number().positive().optional(),

  newsFilterEnabled: z.boolean().default(false),
  newsWindowMinutes: z.number().int().positive().default(15),
});

export type RiskSettings = z.infer<typeof RiskSettingsSchema>;

// ── Gate result ────────────────────────────────────────────────────────────

export type GateVerdict =
  | { pass: true; reason?: never }
  | { pass: false; reason: string };
