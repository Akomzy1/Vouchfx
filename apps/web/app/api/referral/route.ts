import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureAffiliateAccount } from "@/lib/referral";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vouchfx.com";
const PAYOUT_MINIMUM_USD = 50;

export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Ensure affiliate account exists and get code
  const serviceDb = createServiceClient();
  const { referral_code, referral_link_slug } = await ensureAffiliateAccount(serviceDb, user.id);

  // Fetch affiliate stats
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: aff } = await (db as any)
    .from("affiliate_accounts")
    .select("total_clicks, total_signups, total_active_referrals, pending_payout_usd, lifetime_paid_usd, payout_method")
    .eq("user_id", user.id)
    .maybeSingle();

  // Fetch referral rows this user made (as referrer)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: referrals } = await (db as any)
    .from("referrals")
    .select("id, status, first_paid_at, created_at")
    .eq("referrer_id", user.id)
    .order("created_at", { ascending: false });

  // Fetch payout history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: payouts } = await (db as any)
    .from("payouts")
    .select("id, amount_usd, status, method, paid_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const pendingUsd = Number((aff as { pending_payout_usd?: number } | null)?.pending_payout_usd ?? 0);

  return NextResponse.json({
    referral_code,
    referral_link: `${APP_URL}/?ref=${referral_link_slug}`,
    telegram_share_text: `I've been using VouchFX to auto-copy Telegram signals to MT5 — it's been great.\n\nSign up free (7-day trial): ${APP_URL}/?ref=${referral_link_slug}`,
    stats: {
      total_clicks:           Number((aff as { total_clicks?: number } | null)?.total_clicks ?? 0),
      total_signups:          Number((aff as { total_signups?: number } | null)?.total_signups ?? 0),
      total_active_referrals: Number((aff as { total_active_referrals?: number } | null)?.total_active_referrals ?? 0),
      pending_payout_usd:     pendingUsd,
      lifetime_paid_usd:      Number((aff as { lifetime_paid_usd?: number } | null)?.lifetime_paid_usd ?? 0),
      payout_eligible:        pendingUsd >= PAYOUT_MINIMUM_USD,
    },
    payout_method: (aff as { payout_method?: string | null } | null)?.payout_method ?? null,
    referrals: (referrals ?? []) as Array<{ id: string; status: string; first_paid_at: string | null; created_at: string }>,
    payouts:   (payouts ?? [])   as Array<{ id: string; amount_usd: number; status: string; method: string; paid_at: string | null; created_at: string }>,
  });
}
