import { z } from "zod";

// ── Execution mode (applies to the whole channel) ─────────────────────────────

export const ExecutionModeSchema = z.enum(["apply_my_rules", "mirror_provider"]);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

// ── Gate result ────────────────────────────────────────────────────────────────
// Superseded by GateResult in packages/core/src/risk — kept here for compatibility.

export type GateVerdict =
  | { pass: true; reason?: never }
  | { pass: false; reason: string };
