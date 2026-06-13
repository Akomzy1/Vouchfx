import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { referralCode?: unknown };
  try { body = await request.json(); } catch { body = {}; }

  // Apply late referral code if provided (user typed it on step 1 but didn't use the link)
  if (typeof body.referralCode === "string" && body.referralCode.trim()) {
    try {
      const { createServiceClient } = await import("@/lib/supabase/service");
      const { bindReferral } = await import("@/lib/referral");
      const serviceDb = createServiceClient();
      // Explicitly typed code → referral (credit) program, and it overrides any
      // cookie-bound slot (VCH-REF-03: explicit beats cookie) while unearned.
      await bindReferral(serviceDb, user.id, body.referralCode.trim(), "referral", true);
    } catch {
      // Referral bind failure must never block onboarding completion
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)
    .from("users")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}
