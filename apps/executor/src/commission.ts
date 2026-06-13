/**
 * Commission maturation sweep (VCH-REF-04).
 *
 * Promotes commission_ledger rows whose 14-day refund window has passed from
 * 'maturing' → 'matured', crediting the beneficiary's cash balance
 * (pending_payout_usd) or referral-credit balance (credit_balance_usd). All
 * money math lives in fn_settle_matured_commissions() and is idempotent, so
 * running this on a schedule (and opportunistically before balance reads) is
 * always safe.
 */
import type { TypedClient } from "@vouchfx/db";
import type { Logger } from "@vouchfx/core";

export async function settleMaturedCommissions(db: TypedClient, log?: Logger): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any).rpc("fn_settle_matured_commissions");
  if (error) {
    log?.error("commission sweep failed", { error: error.message });
    return 0;
  }
  const n = typeof data === "number" ? data : 0;
  if (n > 0) log?.info("commission sweep matured rows", { count: n });
  return n;
}

/** Hourly maturation sweep + a short boot tick. Returns a stop function. */
export function startCommissionSweep(db: TypedClient, log?: Logger, intervalMs = 60 * 60_000): () => void {
  const boot = setTimeout(() => void settleMaturedCommissions(db, log), 20_000);
  const timer = setInterval(() => void settleMaturedCommissions(db, log), intervalMs);
  return () => {
    clearTimeout(boot);
    clearInterval(timer);
  };
}
