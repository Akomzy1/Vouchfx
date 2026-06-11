/**
 * POST /api/admin/prop/proposals/reject
 *
 * Rejects an agent_proposal without publishing. Gated to rule_approver role.
 *
 * Body: { proposalId: string, reason?: string }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { proposalId, reason } = body as { proposalId?: unknown; reason?: unknown };

  if (typeof proposalId !== "string" || !proposalId)
    return NextResponse.json({ error: "proposalId required" }, { status: 422 });

  // Load the proposal to get firm_id and ruleset_id for the audit row
  const { data: proposal, error: propErr } = await db
    .from("prop_rule_audit")
    .select("id, firm_id, ruleset_id")
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

  const { error: auditErr } = await db.from("prop_rule_audit").insert({
    firm_id:     proposal.firm_id,
    ruleset_id:  proposal.ruleset_id,
    proposal_id: proposalId,
    action:      "rejected",
    actor:       `user:${user.email}`,
    new_values:  reason ? { reason } : null,
  });

  if (auditErr)
    return NextResponse.json({ error: auditErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
