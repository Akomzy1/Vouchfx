/**
 * Referral & affiliate helpers — server-side only, always use the service client.
 *
 * Attribution model: last-touch, bound at signup. One referral row per referee (UNIQUE).
 * Fraud guards: self-referral blocked; duplicate-account protection via the unique constraint.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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

/**
 * Binds a referral at signup.
 *   - Looks up the referrer by referral_code in `users`
 *   - Blocks self-referral
 *   - Inserts into `referrals` (UNIQUE referee_id prevents double-bind)
 *   - Increments referrer's affiliate_accounts.total_signups
 *
 * Returns the referrer_id on success, null if code is invalid or self-referral.
 */
export async function bindReferral(
  db: SupabaseClient,
  refereeId: string,
  referralCode: string
): Promise<string | null> {
  if (!referralCode) return null;

  // Find referrer
  const { data: referrerRow } = await db
    .from("users")
    .select("id")
    .eq("referral_code", referralCode.toUpperCase())
    .maybeSingle();

  if (!referrerRow) return null;
  const referrerId = (referrerRow as { id: string }).id;

  // Block self-referral (VCH-REF-08)
  if (referrerId === refereeId) return null;

  // Insert referral (ON CONFLICT DO NOTHING — UNIQUE referee_id)
  await db.from("referrals").upsert(
    {
      referrer_id: referrerId,
      referee_id: refereeId,
      referral_code: referralCode.toUpperCase(),
    },
    { onConflict: "referee_id", ignoreDuplicates: true }
  );

  // Ensure referrer has an affiliate_accounts row and bump signup count
  await ensureAffiliateAccount(db, referrerId);
  await db.rpc("increment_affiliate_signups", { p_user_id: referrerId });

  return referrerId;
}

const COMMISSION_RATE = 0.20;

/**
 * Accrues 20% commission to the referrer when a referred user's payment is collected.
 * Marks first_paid_at and converts status to 'converted' on the first payment.
 * amountUsd: the amount actually charged (after any discounts).
 */
export async function accrueCommission(
  db: SupabaseClient,
  refereeUserId: string,
  amountUsd: number
): Promise<void> {
  const { data: referral } = await db
    .from("referrals")
    .select("id, referrer_id, status, first_paid_at")
    .eq("referee_id", refereeUserId)
    .maybeSingle();

  if (!referral) return;

  const r = referral as { id: string; referrer_id: string; status: string; first_paid_at: string | null };
  const commission = Math.round(amountUsd * COMMISSION_RATE * 100) / 100;

  // Update referral status on first payment
  if (r.status === "pending") {
    await db.from("referrals").update({
      status: "converted",
      first_paid_at: new Date().toISOString(),
    }).eq("id", r.id);
  }

  // Ensure referrer has an affiliate account
  await ensureAffiliateAccount(db, r.referrer_id);

  // Increment pending_payout_usd and total_active_referrals (on first conversion)
  await db.rpc("accrue_affiliate_commission", {
    p_user_id: r.referrer_id,
    p_commission_usd: commission,
    p_first_conversion: r.status === "pending",
  });
}

/**
 * Claws back commission on refund/chargeback.
 */
export async function clawbackCommission(
  db: SupabaseClient,
  refereeUserId: string,
  amountUsd: number
): Promise<void> {
  const { data: referral } = await db
    .from("referrals")
    .select("referrer_id")
    .eq("referee_id", refereeUserId)
    .maybeSingle();

  if (!referral) return;

  const r = referral as { referrer_id: string };
  const commission = Math.round(amountUsd * COMMISSION_RATE * 100) / 100;

  await db.rpc("clawback_affiliate_commission", {
    p_user_id: r.referrer_id,
    p_commission_usd: commission,
  });
}
