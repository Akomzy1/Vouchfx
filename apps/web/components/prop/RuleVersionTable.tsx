"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  History, Building2, ChevronDown, ExternalLink, Undo2,
  Bot, UserRound, ShieldAlert, Loader2,
} from "lucide-react";
import { classifyProposalStakes } from "@vouchfx/core";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VersionRow {
  id: string;
  firm_id: string;
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
  firms: { id: string; name: string }[];
  versions: VersionRow[];
}

// ── Summary derivation ────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  daily_loss_pct:          "Daily loss",
  daily_loss_basis:        "Daily loss basis",
  max_drawdown_pct:        "Max drawdown",
  max_drawdown_model:      "Max drawdown model",
  consistency_pct:         "Consistency cap",
  news_before_min:         "News window (before)",
  news_after_min:          "News window (after)",
  weekend_holding_allowed: "Weekend holding",
  min_trading_days:        "Min trading days",
  copy_trading_permitted:  "Copy trading",
};

const COMPARABLE = Object.keys(FIELD_LABELS) as (keyof VersionRow)[];

function fmtVal(field: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "allowed" : "not allowed";
  if (["daily_loss_pct", "max_drawdown_pct", "consistency_pct"].includes(field)) return `${v}%`;
  if (["news_before_min", "news_after_min"].includes(field)) return `${v} min`;
  return String(v).replace(/_/g, " ");
}

/** Diff a version against its predecessor in the same challenge. */
function summarize(v: VersionRow, prev: VersionRow | undefined): { text: string; critical: boolean } {
  if (!prev) return { text: `Initial ruleset imported (${v.challenge_name})`, critical: false };
  const changed: string[] = [];
  const parts: string[] = [];
  for (const f of COMPARABLE) {
    if (v[f] !== prev[f]) {
      changed.push(f as string);
      parts.push(`${FIELD_LABELS[f as string]}: ${fmtVal(f as string, prev[f])} → ${fmtVal(f as string, v[f])}`);
    }
  }
  if (parts.length === 0) return { text: `Republished (${v.challenge_name})`, critical: false };
  const critical = classifyProposalStakes(changed) === "critical";
  return { text: parts.join(" · "), critical };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

function PublishedBy({ by }: { by: string | null }) {
  const isAgent = by?.startsWith("agent:") ?? false;
  const name = by ? by.replace(/^(user:|agent:)/, "") : "—";
  if (isAgent) {
    return (
      <span className="inline-flex items-center gap-1.5 text-text-secondary">
        <Bot size={13} className="text-primary-light" /> Agent auto
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-text-secondary">
      <UserRound size={13} className="text-text-muted" /> {name}
    </span>
  );
}

function RollbackButton({ targetId, disabled }: { targetId: string; disabled: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const handleClick = useCallback(async () => {
    if (!confirm("Roll back to this version? A new version will be created from these values.")) return;
    setState("loading");
    try {
      const res = await fetch("/api/admin/prop/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRulesetId: targetId }),
      });
      if (!res.ok) setState("error");
      else router.refresh();
    } catch {
      setState("error");
    } finally {
      setState((s) => (s === "error" ? "error" : "idle"));
    }
  }, [targetId, router]);

  return (
    <button
      onClick={handleClick}
      disabled={disabled || state === "loading"}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-2.5 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-35"
    >
      {state === "loading" ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />} Rollback
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RuleVersionTable({ firms, versions }: Props) {
  const [selected, setSelected] = useState(firms[0]?.id ?? "");

  const rows = useMemo(() => {
    const firmVersions = versions
      .filter((v) => v.firm_id === selected)
      .sort((a, b) => b.version - a.version || a.challenge_name.localeCompare(b.challenge_name));

    // Predecessor lookup within the same challenge
    return firmVersions.map((v) => {
      const prev = firmVersions.find(
        (p) => p.challenge_name === v.challenge_name && p.version === v.version - 1
      );
      return { v, ...summarize(v, prev) };
    });
  }, [versions, selected]);

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="flex flex-col gap-3 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="flex items-center gap-2 text-[16px] font-bold tracking-tight text-text-primary">
            <History size={17} className="text-primary-light" /> Version history
          </h2>
          <p className="mt-0.5 text-[12.5px] text-text-secondary">
            Every published ruleset change, newest first. Roll back any version.
          </p>
        </div>
        <label className="relative inline-flex items-center">
          <Building2 size={15} className="pointer-events-none absolute left-3 text-text-muted" />
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="appearance-none rounded-xl border border-border bg-surface-elevated py-2.5 pl-9 pr-9 text-[13px] font-semibold text-text-primary focus:border-primary/50 focus:outline-none"
          >
            {firms.map((f) => (
              <option key={f.id} value={f.id} className="bg-surface">{f.name}</option>
            ))}
          </select>
          <ChevronDown size={15} className="pointer-events-none absolute right-3 text-text-muted" />
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-[13px] text-text-muted">
          No ruleset versions found for this firm.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border/70 text-[11px] uppercase tracking-wide text-text-muted">
                  <th className="px-5 py-2.5 font-semibold">Version</th>
                  <th className="px-5 py-2.5 font-semibold">Change summary</th>
                  <th className="px-5 py-2.5 font-semibold">Published by</th>
                  <th className="px-5 py-2.5 font-semibold">Date</th>
                  <th className="px-5 py-2.5 font-semibold">Source</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ v, text, critical }) => (
                  <tr key={v.id} className={`border-b border-border/40 text-[13px] transition-colors hover:bg-bg/30 ${v.status === "rolled_back" ? "opacity-55" : ""}`}>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span className="num inline-flex items-center gap-1.5 font-bold text-text-primary">
                        {v.is_current && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        v{v.version}
                      </span>
                      {v.is_current && (
                        <span className="ml-2 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-light">
                          Current
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-text-secondary">
                      <span className="num text-text-primary">{text}</span>
                      {critical && <ShieldAlert size={12} className="ml-1.5 inline text-loss/70" />}
                      <span className="ml-1.5 text-[11px] text-text-muted">· {v.challenge_name}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5"><PublishedBy by={v.published_by} /></td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span className="num text-text-secondary">{fmtDate(v.published_at ?? v.verified_at)}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      {v.source_url ? (
                        <a
                          href={v.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary-light transition-colors hover:text-primary"
                        >
                          <ExternalLink size={13} /> View
                        </a>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right">
                      <RollbackButton targetId={v.id} disabled={v.is_current || v.status === "draft"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked */}
          <div className="flex flex-col divide-y divide-border/50 md:hidden">
            {rows.map(({ v, text, critical }) => (
              <div key={v.id} className={`p-4 ${v.status === "rolled_back" ? "opacity-55" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="num inline-flex items-center gap-2 text-[14px] font-bold text-text-primary">
                    v{v.version}
                    {v.is_current && (
                      <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-light">
                        Current
                      </span>
                    )}
                  </span>
                  <span className="num text-[11.5px] text-text-muted">{fmtDate(v.published_at ?? v.verified_at)}</span>
                </div>
                <div className="mt-2 flex items-start gap-1.5 text-[13px]">
                  <span className="num text-text-primary">{text}</span>
                  {critical && <ShieldAlert size={13} className="mt-0.5 shrink-0 text-loss/70" />}
                </div>
                <div className="mt-2.5 flex items-center justify-between">
                  <div className="text-[12px]"><PublishedBy by={v.published_by} /></div>
                  <RollbackButton targetId={v.id} disabled={v.is_current || v.status === "draft"} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
