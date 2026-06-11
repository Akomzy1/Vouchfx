import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { demoMode?: unknown; referralCode?: unknown };
  try { body = await request.json(); } catch { body = {}; }

  const demoMode = body.demoMode === true;

  // Apply late referral code if provided (user typed it on step 1 but didn't use the link)
  if (typeof body.referralCode === "string" && body.referralCode.trim()) {
    try {
      const { createServiceClient } = await import("@/lib/supabase/service");
      const { bindReferral } = await import("@/lib/referral");
      const serviceDb = createServiceClient();
      await bindReferral(serviceDb, user.id, body.referralCode.trim());
    } catch {
      // Referral bind failure must never block onboarding completion
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from("users")
    .update({
      onboarding_completed_at: new Date().toISOString(),
      demo_mode_enabled: demoMode,
    })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}
