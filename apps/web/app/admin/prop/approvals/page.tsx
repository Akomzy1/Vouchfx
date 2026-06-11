/**
 * Admin — Prop Rule Approval Queue (/admin/prop/approvals)
 *
 * Shows all pending agent_proposal rows (proposals not yet approved/rejected).
 * Gated to the rule_approver role. Linked from /admin/prop-firms.
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ApprovalQueue from "@/components/prop/ApprovalQueue";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Rule Approval Queue" };
export const dynamic = "force-dynamic";

export default async function PropApprovalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const isApprover: boolean = (await db.rpc("is_rule_approver")).data ?? false;
  if (!isApprover) {
    return (
      <div className="p-8 text-center text-text-muted text-sm">
        Access restricted to rule approvers.
      </div>
    );
  }

  // Pending proposals: agent_proposal rows with no subsequent approval/rejection
  const { data: proposals } = await db
    .from("prop_rule_audit")
    .select(`
      id, firm_id, ruleset_id, old_values, new_values,
      source_url, agent_confidence, created_at,
      prop_firms(name),
      prop_rulesets(challenge_name, version)
    `)
    .eq("action", "agent_proposal")
    .order("created_at", { ascending: false })
    .limit(100);

  // For each proposal, check if it's already been actioned
  const allIds: string[] = ((proposals ?? []) as { id: string }[]).map((p) => p.id);

  const { data: actioned } = allIds.length > 0
    ? await db
        .from("prop_rule_audit")
        .select("proposal_id")
        .in("proposal_id", allIds)
        .in("action", ["approved", "rejected", "auto_published"])
    : { data: [] };

  const actionedSet = new Set(
    ((actioned ?? []) as { proposal_id: string }[]).map((r) => r.proposal_id)
  );

  type ProposalRow = {
    id: string;
    firm_id: string;
    ruleset_id: string | null;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    source_url: string | null;
    agent_confidence: number | null;
    created_at: string;
    prop_firms: { name: string } | null;
    prop_rulesets: { challenge_name: string; version: number } | null;
  };

  const pending = ((proposals ?? []) as ProposalRow[]).filter(
    (p) => !actionedSet.has(p.id)
  );

  return (
    <div className="space-y-6 max-w-4xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Rule Approval Queue</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Agent-proposed rule changes awaiting review.
          </p>
        </div>
        <a
          href="/admin/prop-firms"
          className="text-xs text-primary hover:underline"
        >
          ← All firms
        </a>
      </div>

      <ApprovalQueue proposals={pending} />
    </div>
  );
}
