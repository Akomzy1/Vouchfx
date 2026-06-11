import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";

export const metadata: Metadata = { title: "Set up VouchFX" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any;

  // If onboarding already completed, go to dashboard
  const { data: userRow } = await anyDb
    .from("users")
    .select("onboarding_completed_at, referral_code")
    .eq("id", user.id)
    .single();

  const u = userRow as { onboarding_completed_at: string | null; referral_code: string | null } | null;
  if (u?.onboarding_completed_at) redirect("/dashboard");

  // Derive completion state for each step
  const [telegramResult, channelsResult, brokerResult, riskResult, referralResult] = await Promise.all([
    anyDb.from("telegram_sessions").select("status, last_connected_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),

    anyDb.from("signal_sources").select("id")
      .eq("user_id", user.id).eq("is_enabled", true).limit(1),

    anyDb.from("broker_connections").select("id")
      .eq("user_id", user.id).eq("is_active", true).limit(1),

    anyDb.from("risk_settings").select("id")
      .eq("user_id", user.id).maybeSingle(),

    anyDb.from("referrals").select("id")
      .eq("referee_id", user.id).maybeSingle(),
  ]);

  const tgRow     = telegramResult.data as { status: string; last_connected_at: string | null } | null;
  const hasTg     = tgRow?.status === "active";
  const hasChannel= ((channelsResult.data ?? []) as unknown[]).length > 0;
  const hasBroker = ((brokerResult.data ?? []) as unknown[]).length > 0;
  const hasRisk   = !!riskResult.data;
  const alreadyReferred = !!referralResult.data;

  // First incomplete step (1-based)
  let currentStep = 1;
  if (hasTg)      currentStep = 2;
  if (hasTg && hasChannel) currentStep = 3;
  if (hasTg && hasChannel && hasBroker) currentStep = 4;
  if (hasTg && hasChannel && hasBroker && hasRisk) currentStep = 5;

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <OnboardingWizard
        initialStep={currentStep}
        completedSteps={{ hasTg, hasChannel, hasBroker, hasRisk }}
        telegramStatus={(tgRow?.status ?? "none") as "active" | "limited" | "banned" | "disconnected" | "none"}
        telegramLastConnected={tgRow?.last_connected_at ?? null}
        alreadyReferred={alreadyReferred}
      />
    </div>
  );
}
