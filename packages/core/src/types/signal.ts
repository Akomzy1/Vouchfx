import { z } from "zod";

// ── Enums ──────────────────────────────────────────────────────────────────

export const SignalSideSchema = z.enum(["BUY", "SELL"]);
export type SignalSide = z.infer<typeof SignalSideSchema>;

export const OrderTypeSchema = z.enum(["MARKET", "LIMIT", "STOP"]);
export type OrderType = z.infer<typeof OrderTypeSchema>;

export const SlTpUnitSchema = z.enum(["price", "pips", "percent"]);
export type SlTpUnit = z.infer<typeof SlTpUnitSchema>;

export const FollowUpTypeSchema = z.enum([
  "NEW_SIGNAL",
  "MODIFY_SL",
  "MODIFY_TP",
  "MOVE_TO_BE",
  "CLOSE_PARTIAL",
  "CLOSE_ALL",
  "CANCEL_PENDING",
  "IGNORE",
]);
export type FollowUpType = z.infer<typeof FollowUpTypeSchema>;

// ── Parsed signal — the tool-use output schema (see signal-parsing SKILL) ──

export const ParsedSignalSchema = z.object({
  is_signal: z.boolean(),
  symbol: z.string().nullable(),
  side: SignalSideSchema.nullable(),
  order_type: OrderTypeSchema.nullable(),
  /** Entry price(s). Range signals produce two bounds; the executor decides fill behaviour. */
  entries: z.array(z.number()).default([]),
  sl: z.number().nullable(),
  sl_unit: SlTpUnitSchema.nullable(),
  tps: z.array(z.number()).default([]),
  tp_unit: SlTpUnitSchema.nullable(),
  /** 0–1. Reflects extraction certainty, not trade quality. */
  confidence: z.number().min(0).max(1),
  /** Plain-English explanation shown verbatim in the audit log. */
  reasoning: z.string(),
  follow_up_type: FollowUpTypeSchema.nullable(),
  /** True when this message modifies/cancels a prior trade in this channel. */
  references_prior_trade: z.boolean().default(false),
  references_prior_message_id: z.number().nullable(),
  language_detected: z.string().default("en"),
});

export type ParsedSignal = z.infer<typeof ParsedSignalSchema>;
