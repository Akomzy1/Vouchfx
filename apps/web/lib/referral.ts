/**
 * Referral & affiliate helpers — server-side only, always use the service client.
 *
 * Attribution model: last-touch, bound at signup. One referral row per referee (UNIQUE).
 * Fraud guards: self-referral blocked; duplicate-account protection via the unique constraint.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { REFERRAL_AFFILIATE_ENABLED } from "@/lib/flags";

/** Deterministic 8-char code from the user UUID (32 hex chars → first 8 uppercased). */
export function codeFromUserId(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/**
 * Ensures the user has a referral_code in `users` and an affiliate_accounts row.
 * Idempotent — safe to call on every dashboard visit.
 * Returns the affiliate account row.
 */
export async function ensureAffiliateAccount(
  db: SupabaseClient,
  userId: string
): Promise<{ referral_code: string; referral_link_slug: string }> {
  const code = codeFromUserId(userId);

  // Set referral_code on users row if not already set
  await db
    .from("users")
    .update({ referral_code: code })
    .eq("id", userId)
    .is("referral_code", null);

  // Upsert affiliate_accounts
  const { error } = await db.from("affiliate_accounts").upsert(
    {
      user_id: userId,
      referral_code: code,
      referral_link_slug: code.toLowerCase(),
    },
    { onConflict: "user_id", ignoreDuplicates: true }
  );

  if (error && !error.message.includes("duplicate")) {
    throw new Error(`ensureAffiliateAccount: ${error.message}`);
  }

  const { data } = await db
    .from("affiliate_accounts")
    .select("referral_code, referral_link_slug")
    .eq("user_id", userId)
    .single();

  return (data as { referral_code: string; referral_link_slug: string }) ?? {
    referral_code: code,
    referral_link_slug: code.toLowerCase(),
  };
}

export type ReferralSource = "affiliate" | "referral";

/**
 * Binds a referred user to the ONE attribution slot at signup (VCH-REF-03).
 *
 * - Resolves the referrer by code; blocks self-referral (VCH-REF-08).
 * - Stores source_type (affiliate=cash / referral=credit) and locks the bind.
 * - Precedence: an EXPLICIT code entered at signup overrides an existing
 *   cookie-bound slot, but only while it hasn't earned yet (no first payment).
 *   A cookie never overrides an existing slot. Once a payment has been
 *   collected, the slot is immutable.
 *
 * Returns the referrer_id bound, or null if invalid / self / not overridable.
 */
export async function bindReferral(
  db: SupabaseClient,
  refereeId: string,
  referralCode: string,
  source: ReferralSource = "referral",
  explicit = false
): Promise<string | null> {
  // Program deferred at launch — no new attribution is bound. Existing
  // referral rows are left exactly as they are.
  if (!REFERRAL_AFFILIATE_ENABLED) return null;
  if (!referralCode) return null;
  const code = referralCode.toUpperCase();

  const { data: referrerRow } = await db
    .from("users")
    .select("id")
    .eq("referral_code", code)
    .maybeSingle();
  if (!referrerRow) return null;
  const referrerId = (referrerRow as { id: string }).id;

  if (referrerId === refereeId) return null; // self-referral

  const { data: existing } = await db
    .from("referrals")
    .select("id, first_paid_at")
    .eq("referee_id", refereeId)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    const ex = existing as { id: string; first_paid_at: string | null };
    // Only an explicit code may override, and only before any payout has earned.
    if (!explicit || ex.first_paid_at) return null;
    await db.from("referrals").update({
      referrer_id: referrerId,
      referral_code: code,
      source_type: source,
      locked_at: now,
    }).eq("id", ex.id);
    await ensureAffiliateAccount(db, referrerId);
    return referrerId;
  }

  await db.from("referrals").insert({
    referrer_id: referrerId,
    referee_id: refereeId,
    referral_code: code,
    source_type: source,
    locked_at: now,
  });

  await ensureAffiliateAccount(db, referrerId);
  await db.rpc("increment_affiliate_signups", { p_user_id: referrerId });

  return referrerId;
}

/**
 * Accrues commission for one collected payment (VCH-REF-01/04/06).
 * Idempotent on paymentReference — a payment can earn at most once. Writes a
 * 'maturing' ledger row (payable after the 14-day refund window); the 12-month
 * affiliate cap and cash-vs-credit routing are enforced inside the RPC.
 * Trials never reach here (no payment → no call).
 */
export async function accrueCommission(
  db: SupabaseClient,
  refereeUserId: string,
  grossUsd: number,
  paymentReference: string
): Promise<void> {
  // Program deferred at launch — no NEW commission/credit accrues. Existing
  // accrued balances and ledger rows are untouched. (Clawback below stays
  // active so refunds of pre-existing accruals still reverse correctly.)
  if (!REFERRAL_AFFILIATE_ENABLED) return;
  if (!paymentReference || !(grossUsd > 0)) return;
  await db.rpc("fn_accrue_commission", {
    p_payment_reference: paymentReference,
    p_referee_id: refereeUserId,
    p_gross_usd: grossUsd,
  });
}

/**
 * Reverses commission for a refunded/charged-back payment (VCH-REF-04).
 * Idempotent on paymentReference; reverses the matured balance if already credited.
 */
export async function clawbackCommission(
  db: SupabaseClient,
  paymentReference: string
): Promise<void> {
  if (!paymentReference) return;
  await db.rpc("fn_clawback_commission", { p_payment_reference: paymentReference });
}
