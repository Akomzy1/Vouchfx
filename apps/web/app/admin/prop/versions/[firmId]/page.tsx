/**
 * Admin — Prop Ruleset Version History (/admin/prop/versions/[firmId])
 *
 * Shows all ruleset versions for a single firm, grouped by challenge.
 * Each non-current version has a one-click Rollback button.
 * Gated to rule_approver role.
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import VersionHistory from "@/components/prop/VersionHistory";
import type { RulesetVersion } from "@/components/prop/VersionHistory";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ firmId: string }>;
}): Promise<Metadata> {
  const { firmId } = await params;
  return { title: `Admin — Version History (${firmId.slice(0, 8)})` };
}

export default async function PropVersionsPage({
  params,
}: {
  params: Promise<{ firmId: string }>;
}) {
  const { firmId } = await params;

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

  // Fetch firm name + all ruleset versions for this firm
  const [{ data: firm }, { data: rulesets }] = await Promise.all([
    db.from("prop_firms").select("id, name").eq("id", firmId).single(),
    db.from("prop_rulesets")
      .select(`
        id, challenge_name, version, status, is_current,
        daily_loss_pct, daily_loss_basis,
        max_drawdown_pct, max_drawdown_model,
        consistency_pct, news_before_min, news_after_min,
        weekend_holding_allowed, min_trading_days, copy_trading_permitted,
        published_by, published_at, verified_at, source_url
      `)
      .eq("firm_id", firmId)
      .order("challenge_name")
      .order("version", { ascending: false }),
  ]);

  if (!firm) {
    return (
      <div className="p-8 text-center text-text-muted text-sm">
        Firm not found.
      </div>
    );
  }

  const firmName  = (firm as { name: string }).name;
  const versions  = (rulesets ?? []) as RulesetVersion[];

  return (
    <div className="space-y-6 max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">
            Version History — {firmName}
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            All published ruleset versions. Rollback restores values into a new version.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="/admin/prop/approvals"
            className="text-xs text-primary hover:underline"
          >
            Approval queue
          </a>
          <a
            href="/admin/prop-firms"
            className="text-xs text-text-muted hover:text-text-primary"
          >
            ← All firms
          </a>
        </div>
      </div>

      <VersionHistory firmName={firmName} versions={versions} />
    </div>
  );
}
