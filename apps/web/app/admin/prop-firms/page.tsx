/**
 * Admin — Prop Firm Presets (/admin/prop-firms)
 *
 * Internal page for ops to review seeded firm presets, verify rule sources,
 * and inspect the prop_rule_audit trail.
 *
 * Access: requires rule_approver role (checked server-side via is_rule_approver()).
 * Not linked from the user-facing nav.
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Prop Firm Presets" };
export const dynamic = "force-dynamic";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function AdminPropFirmsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Check rule_approver role
  const { data: isApprover } = await db.rpc("is_rule_approver");
  if (!isApprover) {
    return (
      <div className="p-8 text-center text-text-muted text-sm">
        Access restricted to rule approvers.
      </div>
    );
  }

  const [{ data: firms }, { data: rulesets }, { data: audit }] = await Promise.all([
    db.from("prop_firms").select("*").order("name"),
    db.from("prop_rulesets")
      .select("*, prop_firms(name)")
      .order("firm_id")
      .order("challenge_name"),
    db.from("prop_rule_audit")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  type FirmRow = {
    id: string; name: string; slug: string; website_url: string | null;
    active: boolean; created_at: string;
  };
  type RulesetRow = {
    id: string; firm_id: string; challenge_name: string; version: number;
    status: string; is_current: boolean;
    daily_loss_pct: number; daily_loss_basis: string;
    max_drawdown_pct: number; max_drawdown_model: string;
    consistency_pct: number | null; news_before_min: number; news_after_min: number;
    weekend_holding_allowed: boolean; min_trading_days: number;
    copy_trading_permitted: boolean;
    source_url: string | null; verified_at: string | null;
    agent_confidence: number | null; notes: string | null;
    prop_firms: { name: string } | null;
  };
  type AuditRow = {
    id: string; firm_id: string; ruleset_id: string | null;
    action: string; actor: string;
    agent_confidence: number | null; source_url: string | null;
    created_at: string;
  };

  const firmRows = (firms ?? []) as FirmRow[];
  const rulesetRows = (rulesets ?? []) as RulesetRow[];
  const auditRows = (audit ?? []) as AuditRow[];

  return (
    <div className="space-y-8 max-w-6xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Prop Firm Presets</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Internal review of seeded firm data and rule audit trail.
          </p>
        </div>
        <a
          href="/admin/prop/approvals"
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Approval queue →
        </a>
      </div>

      {/* Firms table */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Firms ({firmRows.length})</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-elevated">
                {["Name", "Slug", "Active", "Created", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium text-text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {firmRows.map((f) => (
                <tr key={f.id} className="hover:bg-surface-elevated/50">
                  <td className="px-4 py-2.5 font-medium text-text-primary">
                    {f.website_url ? (
                      <a href={f.website_url} target="_blank" rel="noopener noreferrer"
                         className="text-primary hover:underline">{f.name}</a>
                    ) : f.name}
                  </td>
                  <td className="px-4 py-2.5 text-text-muted font-mono">{f.slug}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      f.active
                        ? "bg-profit/10 text-profit"
                        : "bg-surface-elevated text-text-muted"
                    }`}>
                      {f.active ? "Active" : "Hidden"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-text-muted">{formatDate(f.created_at)}</td>
                  <td className="px-4 py-2.5">
                    <a
                      href={`/admin/prop/versions/${f.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      History →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Rulesets table */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Rulesets ({rulesetRows.length})</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="border-b border-border bg-surface-elevated">
                {["Firm", "Challenge", "Ver", "Status", "Current", "Daily loss", "DD", "Consistency",
                  "News", "Weekend", "Min days", "Copy", "Verified"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-medium text-text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rulesetRows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-elevated/50">
                  <td className="px-3 py-2 font-medium text-text-primary">
                    {r.prop_firms?.name ?? r.firm_id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{r.challenge_name}</td>
                  <td className="px-3 py-2 text-text-muted">{r.version}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 ${
                      r.status === "published" ? "bg-profit/10 text-profit" :
                      r.status === "draft"     ? "bg-surface-elevated text-text-muted" :
                                                 "bg-warning/10 text-warning"
                    }`}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.is_current ? "✓" : ""}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.daily_loss_pct}% ({r.daily_loss_basis})
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.max_drawdown_pct}% ({r.max_drawdown_model})
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.consistency_pct != null ? `${r.consistency_pct}%` : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.news_before_min > 0 || r.news_after_min > 0
                      ? `${r.news_before_min}m / ${r.news_after_min}m`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.weekend_holding_allowed ? "✓" : "✗"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.min_trading_days || "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={r.copy_trading_permitted ? "text-profit" : "text-loss"}>
                      {r.copy_trading_permitted ? "✓" : "✗"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {formatDate(r.verified_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Audit trail */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">
          Rule Audit (last {auditRows.length})
        </h2>
        {auditRows.length === 0 ? (
          <p className="text-xs text-text-muted">No audit events yet.</p>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-elevated">
                  {["Action", "Actor", "Confidence", "Source", "Date"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium text-text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditRows.map((a) => (
                  <tr key={a.id} className="hover:bg-surface-elevated/50">
                    <td className="px-4 py-2.5">
                      <span className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono">{a.action}</span>
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">{a.actor}</td>
                    <td className="px-4 py-2.5 tabular-nums text-text-muted">
                      {a.agent_confidence != null ? `${(a.agent_confidence * 100).toFixed(0)}%` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-text-muted max-w-xs truncate">
                      {a.source_url ? (
                        <a href={a.source_url} target="_blank" rel="noopener noreferrer"
                           className="text-primary hover:underline truncate block max-w-xs">
                          {a.source_url}
                        </a>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">{formatDate(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
