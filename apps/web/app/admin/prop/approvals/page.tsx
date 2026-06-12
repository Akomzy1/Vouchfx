/**
 * Admin — Rule Monitor (/admin/prop/approvals)
 *
 * The prop-firm rule monitoring console: pending agent proposals (approve /
 * reject / edit), summary stats, and embedded version history with rollback.
 * Gated to the rule_approver role.
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  ScanEye, Bot, ShieldCheck, Inbox, ArrowDownWideNarrow,
  Building2, Hourglass, CircleCheck, CircleHelp, UserRoundCheck,
} from "lucide-react";
import ApprovalQueue from "@/components/prop/ApprovalQueue";
import RuleVersionTable, { type VersionRow } from "@/components/prop/RuleVersionTable";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Rule Monitor" };
export const dynamic = "force-dynamic";

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

export default async function RuleMonitorPage() {
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

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [
    { data: proposals },
    { data: firms },
    { data: rulesets },
    { count: autoPublishedToday },
  ] = await Promise.all([
    db.from("prop_rule_audit")
      .select(`
        id, firm_id, ruleset_id, old_values, new_values,
        source_url, agent_confidence, created_at,
        prop_firms(name),
        prop_rulesets(challenge_name, version)
      `)
      .eq("action", "agent_proposal")
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("prop_firms").select("id, name").order("name"),
    db.from("prop_rulesets")
      .select(`
        id, firm_id, challenge_name, version, status, is_current,
        daily_loss_pct, daily_loss_basis,
        max_drawdown_pct, max_drawdown_model,
        consistency_pct, news_before_min, news_after_min,
        weekend_holding_allowed, min_trading_days, copy_trading_permitted,
        published_by, published_at, verified_at, source_url
      `)
      .order("version", { ascending: false }),
    db.from("prop_rule_audit")
      .select("id", { count: "exact", head: true })
      .eq("action", "auto_published")
      .gte("created_at", todayStart.toISOString()),
  ]);

  // Filter out proposals already actioned
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

  const pending = ((proposals ?? []) as ProposalRow[]).filter((p) => !actionedSet.has(p.id));
  const manualCount = pending.filter((p) => (p.agent_confidence ?? 1) < 0.6).length;
  const firmRows = (firms ?? []) as { id: string; name: string }[];
  const versionRows = (rulesets ?? []) as VersionRow[];
  const lastRun = ((proposals ?? []) as { created_at: string }[])[0]?.created_at ?? null;
  const approverName = (user.email ?? "").split("@")[0] ?? "";

  const stats: [string, number, React.ElementType, string][] = [
    ["Firms monitored", firmRows.length, Building2, "text-text-primary"],
    ["Pending approval", pending.length, Hourglass, pending.length > 0 ? "text-warning" : "text-text-primary"],
    ["Auto-published today", autoPublishedToday ?? 0, CircleCheck, "text-primary-light"],
    ["Manual review", manualCount, CircleHelp, manualCount > 0 ? "text-warning" : "text-text-primary"],
  ];

  return (
    <div className="grid-glow flex min-h-screen flex-col bg-bg">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1140px] items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-primary/40 bg-primary/10">
              <ShieldCheck size={16} className="text-primary-light" />
            </span>
            <span className="text-[16px] font-bold tracking-tight text-text-primary">VouchFX</span>
          </div>
          <span className="hidden h-5 w-px bg-border sm:block" />
          <span className="hidden items-center gap-1.5 text-[12.5px] font-semibold text-text-secondary sm:flex">
            <ShieldCheck size={14} className="text-text-muted" /> Admin Console
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary-light">
              <Bot size={13} /><span className="hidden sm:inline">Rule agent</span>
              <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span className="hidden sm:inline">Active</span>
            </span>
            <div className="num flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-elevated text-[12px] font-bold text-primary-light">
              {(user.email ?? "RM").slice(0, 2).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <div className="dot-grid flex-1">
        <main className="scroll-thin mx-auto w-full max-w-[1140px] px-4 pb-16 pt-6 sm:px-6">
          {/* Page header */}
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary-light">
                  <ScanEye size={20} />
                </span>
                <h1 className="text-[24px] font-bold tracking-tight text-text-primary sm:text-[27px]">Rule Monitor</h1>
              </div>
              <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-text-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <Bot size={13} className="text-primary-light" /> Agent last ran{" "}
                  <span className="num text-text-primary">{timeAgo(lastRun)}</span>
                </span>
                <span className="text-text-muted">·</span>
                <span className="num">{firmRows.length} firms monitored</span>
                <span className="text-text-muted">·</span>
                <span className={`num ${pending.length > 0 ? "text-warning" : ""}`}>{pending.length} changes pending</span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium">
                <UserRoundCheck size={13} className="text-primary-light" />
                <span className="text-text-muted">Approver</span>
                <span className="font-semibold text-text-primary">{approverName}</span>
              </span>
            </div>
          </div>

          {/* Summary strip */}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map(([label, val, Icon, color]) => (
              <div key={label} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated">
                  <Icon size={16} className={color} />
                </span>
                <div className="min-w-0">
                  <div className={`num text-[20px] font-bold leading-none ${color}`}>{val}</div>
                  <div className="mt-1 truncate text-[11px] text-text-muted">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Queue heading */}
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[16px] font-bold tracking-tight text-text-primary">
              <Inbox size={17} className="text-primary-light" /> Pending changes
              {pending.length > 0 && (
                <span className="num rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
                  {pending.length}
                </span>
              )}
            </h2>
            <span className="hidden items-center gap-1.5 text-[12px] text-text-muted sm:inline-flex">
              <ArrowDownWideNarrow size={13} /> Highest stakes first
            </span>
          </div>

          <ApprovalQueue proposals={pending} />

          {/* Version history */}
          {firmRows.length > 0 && (
            <div className="mt-9">
              <RuleVersionTable firms={firmRows} versions={versionRows} />
            </div>
          )}

          {/* Footer note */}
          <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-surface/50 px-4 py-3 text-center text-[12px] text-text-muted">
            <ShieldCheck size={14} className="shrink-0 text-primary-light" />
            Only firms that explicitly permit copy trading are supported.
          </div>
        </main>
      </div>
    </div>
  );
}
