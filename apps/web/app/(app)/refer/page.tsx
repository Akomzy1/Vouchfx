import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureAffiliateAccount } from "@/lib/referral";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import ReferTabs from "@/components/refer/ReferTabs";

export const metadata: Metadata = { title: "Refer & Earn" };
export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vouchfx.com";
const PAYOUT_MINIMUM_USD = 50;

export default async function ReferPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const serviceDb = createServiceClient();
  const { referral_code } = await ensureAffiliateAccount(serviceDb, user.id);

  // User referral (account-credit) program link (VCH-REF-06). The affiliate
  // cash link (/r/CODE, VCH-REF-01) is issued separately to approved affiliates.
  const referralLink = `${APP_URL}/ref/${referral_code}`;
  const telegramText = `I've been using VouchFX to auto-copy Telegram signals to MT5 — it's really good.\n\nSign up free (7-day trial, no card required): ${referralLink}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [affResult, referralsResult, payoutsResult, ownReferralResult] = await Promise.all([
    db.from("affiliate_accounts")
      .select("total_clicks, total_signups, total_active_referrals, pending_payout_usd, lifetime_paid_usd, payout_method")
      .eq("user_id", user.id)
      .maybeSingle(),

    db.from("referrals")
      .select("id, status, first_paid_at, created_at")
      .eq("referrer_id", user.id)
      .order("created_at", { ascending: false }),

    db.from("payouts")
      .select("id, amount_usd, status, method, paid_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),

    // Check if this user was themselves referred (for the "You were referred" note)
    db.from("referrals")
      .select("referral_code, first_month_discount_applied")
      .eq("referee_id", user.id)
      .maybeSingle(),
  ]);

  type AffRow = {
    total_clicks: number;
    total_signups: number;
    total_active_referrals: number;
    pending_payout_usd: number;
    lifetime_paid_usd: number;
    payout_method: string | null;
  } | null;

  const aff = affResult.data as AffRow;
  const pendingUsd = Number(aff?.pending_payout_usd ?? 0);

  type ReferralRow = { id: string; status: string; first_paid_at: string | null; created_at: string };
  type PayoutRow   = { id: string; amount_usd: number; status: string; method: string; paid_at: string | null; created_at: string };

  const referrals = (referralsResult.data ?? []) as ReferralRow[];
  const payouts   = (payoutsResult.data ?? []) as PayoutRow[];

  const ownReferral = ownReferralResult.data as { referral_code: string; first_month_discount_applied: boolean } | null;

  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <div className="mb-5">
        <h1 className="text-[20px] font-bold tracking-tight text-text-primary sm:text-[22px]">Refer &amp; earn</h1>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-text-secondary">
          Two ways to earn with VouchFX — both pay <span className="font-semibold text-primary-light">20%</span>.
        </p>
      </div>

      <ReferTabs
        referralCode={referral_code}
        referralLink={referralLink}
        telegramText={telegramText}
        stats={{
          totalClicks:          Number(aff?.total_clicks ?? 0),
          totalSignups:         Number(aff?.total_signups ?? 0),
          totalActiveReferrals: Number(aff?.total_active_referrals ?? 0),
          pendingPayoutUsd:     pendingUsd,
          lifetimePaidUsd:      Number(aff?.lifetime_paid_usd ?? 0),
          payoutEligible:       pendingUsd >= PAYOUT_MINIMUM_USD,
        }}
        payoutMethod={aff?.payout_method ?? null}
        referrals={referrals}
        payouts={payouts}
        ownReferral={ownReferral}
      />
    </div>
  );
}
