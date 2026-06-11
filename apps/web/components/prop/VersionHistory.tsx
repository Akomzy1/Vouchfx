"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RulesetVersion {
  id: string;
  challenge_name: string;
  version: number;
  status: string;
  is_current: boolean;
  daily_loss_pct: number;
  daily_loss_basis: string;
  max_drawdown_pct: number;
  max_drawdown_model: string;
  consistency_pct: number | null;
  news_before_min: number;
  news_after_min: number;
  weekend_holding_allowed: boolean;
  min_trading_days: number;
  copy_trading_permitted: boolean;
  published_by: string | null;
  published_at: string | null;
  verified_at: string | null;
  source_url: string | null;
}

interface Props {
  firmName: string;
  versions: RulesetVersion[];
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function stripActorPrefix(actor: string | null): string {
  if (!actor) return "—";
  return actor.replace(/^(user:|agent:)/, "");
}

function statusClass(status: string) {
  switch (status) {
    case "published":   return "bg-profit/10 text-profit";
    case "rolled_back": return "bg-warning/10 text-warning";
    case "rejected":    return "bg-loss/10 text-loss";
    default:            return "bg-surface-elevated text-text-muted";
  }
}

// ── Rollback button ───────────────────────────────────────────────────────────

function RollbackButton({ targetId }: { targetId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleClick = useCallback(async () => {
    if (!confirm("Roll back to this version? A new version will be created from these values.")) return;
    setState("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/prop/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRulesetId: targetId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErrorMsg((j as { error?: string }).error ?? "Rollback failed");
        setState("error");
      } else {
        setState("done");
        setTimeout(() => router.refresh(), 800);
      }
    } catch {
      setErrorMsg("Network error");
      setState("error");
    }
  }, [targetId, router]);

  if (state === "done") {
    return (
      <span className="flex items-center gap-1 text-xs text-profit">
        <CheckCircle2 size={12} /> Done
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={state === "loading"}
        className="flex items-center gap-1.5 rounded-lg border border-warning/40 px-2.5 py-1 text-xs font-medium text-warning hover:bg-warning/10 disabled:opacity-40 transition-colors"
      >
        {state === "loading"
          ? <Loader2 size={11} className="animate-spin" />
          : <RotateCcw size={11} />}
        Rollback
      </button>
      {state === "error" && (
        <span className="text-[10px] text-loss">{errorMsg}</span>
      )}
    </div>
  );
}

// ── Challenge section ─────────────────────────────────────────────────────────

function ChallengeSection({
  challengeName,
  versions,
}: {
  challengeName: string;
  versions: RulesetVersion[];
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="space-y-2">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-2 text-sm font-semibold text-text-primary hover:text-primary transition-colors"
      >
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {challengeName}
        <span className="text-xs font-normal text-text-muted">
          ({versions.length} version{versions.length !== 1 ? "s" : ""})
        </span>
      </button>

      {expanded && (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="border-b border-border bg-surface-elevated">
                {["Ver", "Status", "Daily loss", "Drawdown", "Consistency", "News", "Weekend", "Copy", "Published by", "Date", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-medium text-text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {versions.map((v) => (
                <tr
                  key={v.id}
                  className={`hover:bg-surface-elevated/50 ${v.is_current ? "bg-primary/5" : ""}`}
                >
                  <td className="px-3 py-2.5 tabular-nums font-mono font-medium text-text-primary">
                    v{v.version}
                    {v.is_current && (
                      <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">
                        current
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 ${statusClass(v.status)}`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {v.daily_loss_pct}% ({v.daily_loss_basis})
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {v.max_drawdown_pct}% ({v.max_drawdown_model})
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {v.consistency_pct != null ? `${v.consistency_pct}%` : "—"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {v.news_before_min > 0 || v.news_after_min > 0
                      ? `${v.news_before_min}m/${v.news_after_min}m`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {v.weekend_holding_allowed ? "✓" : "✗"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={v.copy_trading_permitted ? "text-profit" : "text-loss"}>
                      {v.copy_trading_permitted ? "✓" : "✗"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-text-muted max-w-[140px] truncate">
                    {stripActorPrefix(v.published_by)}
                  </td>
                  <td className="px-3 py-2.5 text-text-muted">
                    {formatDate(v.published_at ?? v.verified_at)}
                  </td>
                  <td className="px-3 py-2.5">
                    {!v.is_current && v.status !== "draft" && (
                      <RollbackButton targetId={v.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VersionHistory({ firmName, versions }: Props) {
  // Group by challenge_name
  const groups: Record<string, RulesetVersion[]> = {};
  for (const v of versions) {
    const key = v.challenge_name;
    const arr: RulesetVersion[] = groups[key] ?? [];
    arr.push(v);
    groups[key] = arr;
  }
  // Sort each group desc by version
  for (const arr of Object.values(groups)) {
    arr.sort((a, b) => b.version - a.version);
  }
  const challengeNames = Object.keys(groups).sort();

  if (challengeNames.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-text-muted">
        No ruleset versions found for {firmName}.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {challengeNames.map((name) => (
        <ChallengeSection key={name} challengeName={name} versions={groups[name] ?? []} />
      ))}
    </div>
  );
}
