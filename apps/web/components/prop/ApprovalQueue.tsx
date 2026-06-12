"use client";

import { useState, useCallback } from "react";
import {
  Check, X, PencilLine, ExternalLink, ArrowRight, Loader2,
  ShieldAlert, Feather, Tag, CircleCheckBig, CircleDashed, CircleHelp,
  GitCompareArrows, CalendarClock, Cpu, CircleCheck, CircleSlash,
  TriangleAlert,
} from "lucide-react";
import { classifyProposalStakes } from "@vouchfx/core";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Proposal {
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
}

interface Props {
  proposals: Proposal[];
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

function formatFieldValue(field: string, val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (["daily_loss_pct", "max_drawdown_pct", "consistency_pct"].includes(field)) return `${val}%`;
  if (["news_before_min", "news_after_min"].includes(field)) return `${val} min`;
  return String(val);
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    daily_loss_pct:          "Daily loss limit",
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
  return labels[field] ?? field;
}

function categoryLabel(field: string): string {
  const cats: Record<string, string> = {
    daily_loss_pct: "Daily loss",
    daily_loss_basis: "Daily loss",
    max_drawdown_pct: "Max drawdown",
    max_drawdown_model: "Max drawdown",
    consistency_pct: "Consistency",
    news_before_min: "News window",
    news_after_min: "News window",
    weekend_holding_allowed: "Weekend holding",
    min_trading_days: "Trading days",
    copy_trading_permitted: "Copy trading",
  };
  return cats[field] ?? field;
}

function confidenceLevel(c: number | null): { label: string; Icon: React.ElementType; cls: string } {
  if (c == null || c < 0.6)
    return { label: "Low confidence", Icon: CircleHelp, cls: "border-border bg-surface text-text-secondary" };
  if (c < 0.85)
    return { label: "Medium confidence", Icon: CircleDashed, cls: "border-warning/30 bg-warning/10 text-warning" };
  return { label: "High confidence", Icon: CircleCheckBig, cls: "border-primary/30 bg-primary/10 text-primary-light" };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StakesTag({ critical }: { critical: boolean }) {
  if (critical) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-loss/40 bg-loss/[0.08] px-2.5 py-1 text-[11.5px] font-semibold text-loss">
        <ShieldAlert size={13} /> Account-killing — approval required
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-2.5 py-1 text-[11.5px] font-medium text-text-secondary">
      <Feather size={13} className="text-text-muted" /> Low-stakes
    </span>
  );
}

function EditCell({ field, value, onChange }: { field: string; value: unknown; onChange: (val: unknown) => void }) {
  if (field === "daily_loss_basis" || field === "max_drawdown_model") {
    const options = field === "daily_loss_basis" ? ["equity", "balance"] : ["static", "eod_trailing", "intraday_trailing"];
    return (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="num rounded-lg border border-primary/40 bg-primary/[0.06] px-2 py-1 text-[13px] font-bold text-primary-light focus:outline-none"
      >
        {options.map((o) => <option key={o} value={o} className="bg-surface">{o}</option>)}
      </select>
    );
  }
  if (field === "weekend_holding_allowed" || field === "copy_trading_permitted") {
    return (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value === "true")}
        className="num rounded-lg border border-primary/40 bg-primary/[0.06] px-2 py-1 text-[13px] font-bold text-primary-light focus:outline-none"
      >
        <option value="true" className="bg-surface">Yes</option>
        <option value="false" className="bg-surface">No</option>
      </select>
    );
  }
  return (
    <input
      type="number"
      step="0.001"
      value={typeof value === "number" || typeof value === "string" ? Number(value) : 0}
      onChange={(e) => onChange(Number(e.target.value))}
      className="num w-24 rounded-lg border border-primary/40 bg-primary/[0.06] px-2 py-1 text-[13px] font-bold text-primary-light focus:outline-none"
    />
  );
}

function DiffBlock({
  field, oldVal, newVal, unclear, editMode, editedVal, onEdit,
}: {
  field: string;
  oldVal: unknown;
  newVal: unknown;
  unclear: boolean;
  editMode: boolean;
  editedVal: unknown;
  onEdit: (val: unknown) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg/40 p-3.5 sm:p-4">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">
        <GitCompareArrows size={13} /> Changed field
      </div>
      <div className="mt-2 text-[13px] font-semibold text-text-primary">{fieldLabel(field)}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        {unclear ? (
          <span className="inline-flex items-center gap-2 rounded-lg border border-dashed border-warning/40 bg-warning/[0.06] px-3 py-2 text-[12.5px] font-medium text-warning">
            <CircleHelp size={15} /> Low confidence — verify the source before approving
          </span>
        ) : (
          <>
            <span className="inline-flex items-baseline gap-1.5 rounded-lg border border-border bg-surface-elevated px-3 py-1.5">
              <span className="text-[10px] uppercase tracking-wide text-text-muted">old</span>
              <span className="num text-[15px] font-bold text-text-secondary line-through decoration-text-muted/60">
                {formatFieldValue(field, oldVal)}
              </span>
            </span>
            <ArrowRight size={16} className="text-text-muted" />
            {editMode ? (
              <EditCell field={field} value={editedVal} onChange={onEdit} />
            ) : (
              <span className="inline-flex items-baseline gap-1.5 rounded-lg border border-warning/45 bg-warning/[0.1] px-3 py-1.5 ring-1 ring-warning/20">
                <span className="text-[10px] uppercase tracking-wide text-warning/80">new</span>
                <span className="num text-[15px] font-bold text-warning">{formatFieldValue(field, newVal)}</span>
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  icon: Icon, children, tone = "ghost", onClick, disabled, busy,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  tone?: "primary" | "ghost";
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const tones = {
    primary: "bg-primary text-[#04201D] hover:bg-primary-light",
    ghost: "border border-border bg-surface-elevated text-text-secondary hover:text-text-primary",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} strokeWidth={2.2} />} {children}
    </button>
  );
}

// ── Proposal card ─────────────────────────────────────────────────────────────

function ProposalCard({ proposal, onActioned }: { proposal: Proposal; onActioned: (id: string) => void }) {
  const [editMode, setEditMode] = useState(false);
  const [edited, setEdited] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState<"approve" | "reject" | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const oldValues = proposal.old_values ?? {};
  const rawNew = proposal.new_values ?? {};
  const { _reasoning, ...newValues } = rawNew as Record<string, unknown>;

  const changedFields = Object.keys(newValues);
  const critical = classifyProposalStakes(changedFields) === "critical";
  const lowConfidence = (proposal.agent_confidence ?? 1) < 0.6;
  const conf = confidenceLevel(proposal.agent_confidence);
  const ConfIcon = conf.Icon;

  const firmLabel = proposal.prop_firms?.name ?? proposal.firm_id.slice(0, 8);
  const challengeLabel = proposal.prop_rulesets?.challenge_name ?? "—";

  const handleEdit = useCallback((field: string, val: unknown) => {
    setEdited((prev) => ({ ...prev, [field]: val }));
  }, []);

  const approve = useCallback(async () => {
    setSaving("approve");
    setError(null);
    try {
      const editedValues =
        editMode && Object.keys(edited).length > 0 ? { ...newValues, ...edited } : undefined;
      const res = await fetch("/api/admin/prop/proposals/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: proposal.id, editedValues }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? "Approve failed");
      } else {
        setDone("approved");
        setTimeout(() => onActioned(proposal.id), 1200);
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(null);
    }
  }, [proposal.id, editMode, edited, newValues, onActioned]);

  const reject = useCallback(async () => {
    setSaving("reject");
    setError(null);
    try {
      const res = await fetch("/api/admin/prop/proposals/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: proposal.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? "Reject failed");
      } else {
        setDone("rejected");
        setTimeout(() => onActioned(proposal.id), 1200);
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(null);
    }
  }, [proposal.id, onActioned]);

  return (
    <div className={`overflow-hidden rounded-2xl border bg-surface transition-colors ${done ? "border-border opacity-90" : critical ? "border-loss/25" : "border-border"}`}>
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-start sm:p-5">
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-[16px] font-bold ${lowConfidence ? "border-warning/30 bg-warning/10 text-warning" : "border-primary/30 bg-primary/10 text-primary-light"}`}>
            {firmLabel.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-[15.5px] font-bold tracking-tight text-text-primary">{firmLabel}</h3>
              <span className="text-text-muted">—</span>
              <span className="num text-[12.5px] text-text-secondary">{challengeLabel}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                <Tag size={11} /> {categoryLabel(changedFields[0] ?? "")}
                {changedFields.length > 1 && ` +${changedFields.length - 1}`}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${conf.cls}`}>
                <ConfIcon size={11} /> {conf.label}
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center sm:pt-1">
          <StakesTag critical={critical} />
        </div>
      </div>

      {/* Status banners */}
      {done === "approved" && (
        <div className="flex items-center gap-2 border-b border-primary/20 bg-primary/[0.05] px-4 py-2.5 text-[12.5px] font-medium text-primary-light sm:px-5">
          <CircleCheck size={15} /> Approved &amp; published · added to version history
        </div>
      )}
      {done === "rejected" && (
        <div className="flex items-center gap-2 border-b border-border bg-bg/40 px-4 py-2.5 text-[12.5px] font-medium text-text-secondary sm:px-5">
          <CircleSlash size={15} className="text-text-muted" /> Rejected · change discarded, not published
        </div>
      )}
      {!done && lowConfidence && (
        <div className="flex items-center gap-2 border-b border-warning/20 bg-warning/[0.05] px-4 py-2.5 text-[12.5px] font-medium text-warning sm:px-5">
          <TriangleAlert size={15} /> Manual review needed · agent could not parse a confident value
        </div>
      )}

      {/* Body */}
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          {changedFields.map((field) => (
            <DiffBlock
              key={field}
              field={field}
              oldVal={oldValues[field]}
              newVal={newValues[field]}
              unclear={false}
              editMode={editMode}
              editedVal={edited[field] ?? newValues[field]}
              onEdit={(v) => handleEdit(field, v)}
            />
          ))}
        </div>

        {typeof _reasoning === "string" && _reasoning && (
          <p className="mt-3 text-[12.5px] leading-relaxed text-text-secondary">{_reasoning}</p>
        )}

        {editMode && Object.keys(edited).length > 0 && (
          <div className="num mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/[0.06] px-2.5 py-1 text-[11px] text-primary-light">
            <PencilLine size={11} /> Value edited by approver — logged in the version history
          </div>
        )}

        {/* Meta row */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock size={12} /> Detected <span className="num text-text-secondary">{timeAgo(proposal.created_at)}</span>
          </span>
          {proposal.source_url && (
            <a
              href={proposal.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-primary-light transition-colors hover:text-primary"
            >
              <ExternalLink size={12} /> View source
            </a>
          )}
          {proposal.agent_confidence != null && (
            <span className="inline-flex items-center gap-1.5">
              <Cpu size={12} /> <span className="num">{Math.round(proposal.agent_confidence * 100)}% confidence</span>
            </span>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-loss">{error}</p>}

        {/* Actions */}
        {!done && (
          <div className={`mt-5 flex flex-wrap items-center gap-2.5 border-t pt-4 ${lowConfidence ? "border-warning/20" : "border-border/60"}`}>
            <ActionBtn icon={Check} tone="primary" onClick={approve} disabled={saving !== null} busy={saving === "approve"}>
              {editMode && Object.keys(edited).length > 0 ? "Approve with edits" : "Approve"}
            </ActionBtn>
            <ActionBtn icon={X} onClick={reject} disabled={saving !== null} busy={saving === "reject"}>
              Reject
            </ActionBtn>
            <ActionBtn
              icon={PencilLine}
              onClick={() => { setEditMode((e) => !e); if (editMode) setEdited({}); }}
              disabled={saving !== null}
            >
              {editMode ? "Cancel edit" : "Edit value"}
            </ActionBtn>
            {lowConfidence && proposal.source_url && (
              <a
                href={proposal.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface-elevated px-3.5 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
              >
                <ExternalLink size={15} /> Open source
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ApprovalQueue({ proposals }: Props) {
  const [visible, setVisible] = useState(proposals.map((p) => p.id));

  const handleActioned = useCallback((id: string) => {
    setVisible((prev) => prev.filter((v) => v !== id));
  }, []);

  const pendingProposals = proposals.filter((p) => visible.includes(p.id));

  // Highest stakes first
  const sorted = [...pendingProposals].sort((a, b) => {
    const stakes = (p: Proposal) =>
      classifyProposalStakes(Object.keys((p.new_values ?? {}) as Record<string, unknown>).filter((f) => !f.startsWith("_"))) === "critical" ? 0 : 1;
    return stakes(a) - stakes(b);
  });

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary-light">
          <CircleCheck size={24} />
        </span>
        <p className="mt-4 text-sm font-medium text-text-primary">Queue is empty</p>
        <p className="mt-1 text-xs text-text-muted">
          No pending rule proposals. The Rule Monitor will surface new ones when changes are detected.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {sorted.map((p) => (
        <ProposalCard key={p.id} proposal={p} onActioned={handleActioned} />
      ))}
    </div>
  );
}
