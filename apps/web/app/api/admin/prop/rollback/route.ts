/**
 * POST /api/admin/prop/rollback
 *
 * Rolls back the current ruleset for a firm/challenge to a previous version.
 * Gated to the rule_approver role.
 *
 * Body: { targetRulesetId: string }
 *
 * The server resolves the current active ruleset for the same firm+challenge,
 * then calls rollbackPropRuleset (deactivate current → new row from target → audit).
 * Affected users are notified after success.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientFromEnv, rollbackPropRuleset } from "@vouchfx/db";
import { parseEnv } from "@vouchfx/config";
import { notify } from "@vouchfx/core";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const isApprover: boolean = (await db.rpc("is_rule_approver")).data ?? false;
  if (!isApprover) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { targetRulesetId } = body as { targetRulesetId?: unknown };
  if (typeof targetRulesetId !== "string" || !targetRulesetId)
    return NextResponse.json({ error: "targetRulesetId required" }, { status: 422 });

  // Load target to get firm_id + challenge_name
  const { data: target, error: tgtErr } = await db
    .from("prop_rulesets")
    .select("id, firm_id, challenge_name, prop_firms(name)")
    .eq("id", targetRulesetId)
    .single() as {
      data: { id: string; firm_id: string; challenge_name: string; prop_firms: { name: string } | null } | null;
      error: { message: string } | null;
    };

  if (tgtErr || !target)
    return NextResponse.json({ error: "Target ruleset not found" }, { status: 404 });

  // Resolve the current active version for the same firm + challenge
  const { data: current, error: curErr } = await db
    .from("prop_rulesets")
    .select("id")
    .eq("firm_id", target.firm_id)
    .eq("challenge_name", target.challenge_name)
    .eq("is_current", true)
    .single() as { data: { id: string } | null; error: { message: string } | null };

  if (curErr || !current)
    return NextResponse.json({ error: "No current ruleset found for this firm/challenge" }, { status: 404 });

  if (current.id === targetRulesetId)
    return NextResponse.json({ error: "Target is already the current version" }, { status: 409 });

  const env = parseEnv();
  const adminDb = createAdminClientFromEnv(env);

  try {
    const newRulesetId = await rollbackPropRuleset({
      db: adminDb,
      targetRulesetId,
      currentRulesetId: current.id,
      rolledBackBy: `user:${user.email}`,
    });

    // Notify users whose profile referenced the old current ruleset
    try {
      const { data: profiles } = await db
        .from("prop_account_profiles")
        .select("user_id")
        .eq("ruleset_id", current.id)
        .eq("enabled", true);

      const userIds = [...new Set(
        ((profiles ?? []) as { user_id: string }[]).map((p) => p.user_id),
      )];

      if (userIds.length > 0) {
        const { data: affectedUsers } = await db
          .from("users")
          .select("id, email")
          .in("id", userIds);

        const firmName      = target.prop_firms?.name ?? "your firm";
        const challengeName = target.challenge_name;

        for (const u of (affectedUsers ?? []) as { id: string; email: string }[]) {
          await notify(db, {
            userId: u.id,
            toEmail: u.email,
            event: "prop_rule_published",
            title: `Prop rules rolled back — ${firmName} ${challengeName}`,
            body: "A rule rollback was applied for your challenge. Review your Prop Mode settings.",
            resendApiKey: env.RESEND_API_KEY ?? null,
          });
        }
      }
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ newRulesetId });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
