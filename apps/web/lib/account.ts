/**
 * Account-deletion money-safety guard (NFR-06 + referral money rules).
 *
 * A user must not be deleted while VouchFX owes them cash, because their
 * affiliate_accounts balance cascade-deletes with the user. We block deletion
 * if there is any owed cash — pending + locked payout balance, or cash
 * commissions still maturing (which would otherwise mature to a deleted
 * beneficiary). Referral CREDIT is the user's own to spend, not cash owed to
 * them, so it does not block (it is forfeited on self-deletion).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = { from(t: string): any; rpc(fn: string, args?: any): any };

export interface DeletionCheck {
  blocked: boolean;
  owedUsd: number;
  reason?: string;
}

export async function checkAccountDeletion(db: AnyDb, userId: string): Promise<DeletionCheck> {
  // Mature anything past its window first so balances are current (idempotent).
  try { await db.rpc("fn_settle_matured_commissions"); } catch { /* non-fatal */ }

  const { data: aff } = await db
    .from("affiliate_accounts")
    .select("pending_payout_usd, locked_payout_usd")
    .eq("user_id", userId)
    .maybeSingle();

  const pending = Number((aff as { pending_payout_usd?: number } | null)?.pending_payout_usd ?? 0);
  const locked = Number((aff as { locked_payout_usd?: number } | null)?.locked_payout_usd ?? 0);

  // Cash commissions still maturing toward this user (not yet in the balance).
  const { data: maturing } = await db
    .from("commission_ledger")
    .select("amount_usd")
    .eq("beneficiary_id", userId)
    .eq("kind", "cash")
    .eq("status", "maturing");

  const maturingCash = ((maturing ?? []) as { amount_usd: number }[])
    .reduce((s, r) => s + Number(r.amount_usd), 0);

  const owed = Math.round((pending + locked + maturingCash) * 100) / 100;

  if (owed > 0) {
    return {
      blocked: true,
      owedUsd: owed,
      reason: `You have $${owed.toFixed(2)} in affiliate earnings owed (some may still be maturing). Request a payout and wait for it to be paid before deleting your account.`,
    };
  }
  return { blocked: false, owedUsd: 0 };
}
