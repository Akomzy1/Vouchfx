/**
 * POST /api/prop — create a prop_account_profile for a broker connection.
 *
 * Body: { brokerId, rulesetId, challengeStartBalanceUsd }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUsePropMode } from "@vouchfx/core";
import type { Plan } from "@vouchfx/core";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { brokerId, rulesetId, challengeStartBalanceUsd } = body as {
    brokerId?: unknown;
    rulesetId?: unknown;
    challengeStartBalanceUsd?: unknown;
  };

  if (typeof brokerId !== "string" || !brokerId)
    return NextResponse.json({ error: "brokerId required" }, { status: 422 });
  if (typeof rulesetId !== "string" || !rulesetId)
    return NextResponse.json({ error: "rulesetId required" }, { status: 422 });
  if (
    typeof challengeStartBalanceUsd !== "number" ||
    isNaN(challengeStartBalanceUsd) ||
    challengeStartBalanceUsd <= 0
  )
    return NextResponse.json({ error: "challengeStartBalanceUsd must be a positive number" }, { status: 422 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Plan gate — Prop Mode requires the Funded tier
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

  // Verify broker belongs to user
  const { data: broker } = await db
    .from("broker_connections")
    .select("id")
    .eq("id", brokerId)
    .single();
  if (!broker) return NextResponse.json({ error: "Broker not found" }, { status: 404 });

  // Verify ruleset is published/current
  const { data: ruleset } = await db
    .from("prop_rulesets")
    .select("id, copy_trading_permitted")
    .eq("id", rulesetId)
    .single();
  if (!ruleset) return NextResponse.json({ error: "Ruleset not found" }, { status: 404 });

  const { data, error } = await db
    .from("prop_account_profiles")
    .upsert(
      {
        user_id: user.id,
        broker_connection_id: brokerId,
        ruleset_id: rulesetId,
        challenge_start_balance_usd: challengeStartBalanceUsd,
        enabled: true,
      },
      { onConflict: "broker_connection_id" }
    )
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data }, { status: 201 });
}
