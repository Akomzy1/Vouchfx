/**
 * PATCH /api/prop/stealth — update stealth_config on a prop_account_profile.
 *
 * Body: { profileId: string, config: StealthConfig }
 *
 * RLS ensures users can only update their own profiles.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUsePropMode } from "@vouchfx/core";
import type { Plan } from "@vouchfx/core";

const MIN_DELAY = 0;
const MAX_DELAY = 10_000;

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { profileId, config } = body as {
    profileId?: unknown;
    config?: unknown;
  };

  if (typeof profileId !== "string" || !profileId)
    return NextResponse.json({ error: "profileId required" }, { status: 422 });
  if (typeof config !== "object" || config === null || Array.isArray(config))
    return NextResponse.json({ error: "config must be an object" }, { status: 422 });

  const c = config as Record<string, unknown>;

  if (typeof c.enabled !== "boolean")
    return NextResponse.json({ error: "config.enabled must be boolean" }, { status: 422 });
  if (typeof c.lotJitterFraction !== "number" || c.lotJitterFraction < 0 || c.lotJitterFraction > 0.5)
    return NextResponse.json({ error: "config.lotJitterFraction must be 0–0.5" }, { status: 422 });
  if (typeof c.slTpJitterPips !== "number" || c.slTpJitterPips < 0 || c.slTpJitterPips > 20)
    return NextResponse.json({ error: "config.slTpJitterPips must be 0–20" }, { status: 422 });
  if (
    !Array.isArray(c.delayRangeMs) ||
    c.delayRangeMs.length !== 2 ||
    typeof c.delayRangeMs[0] !== "number" ||
    typeof c.delayRangeMs[1] !== "number" ||
    c.delayRangeMs[0] < MIN_DELAY ||
    c.delayRangeMs[1] > MAX_DELAY ||
    c.delayRangeMs[0] > c.delayRangeMs[1]
  )
    return NextResponse.json({ error: "config.delayRangeMs invalid" }, { status: 422 });
  if (typeof c.orderComment !== "string" || c.orderComment.length > 64)
    return NextResponse.json({ error: "config.orderComment must be string ≤64 chars" }, { status: 422 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Plan gate
  const { data: subRow } = await db
    .from("subscriptions")
    .select("plan")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { plan: Plan } | null };

  if (!canUsePropMode(subRow?.plan ?? "trial")) {
    return NextResponse.json({ error: "Prop Mode requires the Funded plan" }, { status: 403 });
  }

  const { data, error } = await db
    .from("prop_account_profiles")
    .update({ stealth_config: config })
    .eq("id", profileId)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
