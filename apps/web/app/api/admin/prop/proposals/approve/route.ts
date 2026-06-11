/**
 * POST /api/admin/prop/proposals/approve
 *
 * Approves an agent_proposal and publishes a new ruleset version.
 * Gated to the rule_approver role.
 *
 * Body: {
 *   proposalId: string          — prop_rule_audit.id of the agent_proposal row
 *   editedValues?: Record       — optional overrides; defaults to proposal new_values
 * }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientFromEnv, publishPropRuleset } from "@vouchfx/db";
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

  const { proposalId, editedValues } = body as {
    proposalId?: unknown;
    editedValues?: unknown;
  };

  if (typeof proposalId !== "string" || !proposalId)
    return NextResponse.json({ error: "proposalId required" }, { status: 422 });
  if (editedValues !== undefined && (typeof editedValues !== "object" || editedValues === null))
    return NextResponse.json({ error: "editedValues must be an object" }, { status: 422 });

  // Load the proposal row
  const { data: proposal, error: propErr } = await db
    .from("prop_rule_audit")
    .select("id, firm_id, ruleset_id, new_values, source_url, agent_confidence")
    .eq("id", proposalId)
    .eq("action", "agent_proposal")
    .single();

  if (propErr || !proposal)
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  // Check it hasn't already been actioned
  const { data: actioned } = await db
    .from("prop_rule_audit")
    .select("id")
    .eq("proposal_id", proposalId)
    .in("action", ["approved", "rejected", "auto_published"])
    .limit(1);

  if ((actioned ?? []).length > 0)
    return NextResponse.json({ error: "Proposal already actioned" }, { status: 409 });

  const newValues = (editedValues ?? (proposal.new_values as Record<string, unknown>)) as Record<string, unknown>;
  // Strip internal _reasoning key before publishing
  const { _reasoning: _r, ...publishValues } = newValues as Record<string, unknown>;
  void _r;

  // Use service-role client for the multi-step publish (bypasses RLS on prop_rulesets)
  const env = parseEnv();
  const adminDb = createAdminClientFromEnv(env);

  // Load ruleset metadata (firm name + challenge) for the notification body
  const { data: rulesetMeta } = await db
    .from("prop_rulesets")
    .select("challenge_name, prop_firms(name)")
    .eq("id", proposal.ruleset_id as string)
    .single() as { data: { challenge_name: string; prop_firms: { name: string } | null } | null };

  const firmName      = rulesetMeta?.prop_firms?.name ?? "your firm";
  const challengeName = rulesetMeta?.challenge_name   ?? "your challenge";

  try {
    const newRulesetId = await publishPropRuleset({
      db: adminDb,
      proposalId,
      currentRulesetId: proposal.ruleset_id as string,
      newValues: publishValues,
      action: "approved",
      publishedBy: `user:${user.email}`,
      sourceUrl: proposal.source_url as string | null,
      agentConfidence: proposal.agent_confidence as number | null,
    });

    // Notify users whose prop profile referenced the old ruleset
    try {
      const { data: profiles } = await db
        .from("prop_account_profiles")
        .select("user_id")
        .eq("ruleset_id", proposal.ruleset_id as string)
        .eq("enabled", true);

      const userIds = [...new Set(
        ((profiles ?? []) as { user_id: string }[]).map((p) => p.user_id),
      )];

      if (userIds.length > 0) {
        const { data: affectedUsers } = await db
          .from("users")
          .select("id, email")
          .in("id", userIds);

        for (const u of (affectedUsers ?? []) as { id: string; email: string }[]) {
          await notify(db as Parameters<typeof notify>[0], {
            userId: u.id,
            toEmail: u.email,
            event: "prop_rule_published",
            title: `Prop rules updated — ${firmName} ${challengeName}`,
            body: "A rule update was published for your challenge. Review your Prop Mode settings.",
            resendApiKey: env.RESEND_API_KEY ?? null,
          });
        }
      }
    } catch {
      // Non-fatal: publish succeeded; notification failure must not roll back
    }

    return NextResponse.json({ rulesetId: newRulesetId });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
