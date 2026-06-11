"use client";

import { useState, useCallback } from "react";
import {
  CheckCircle2, XCircle, Edit3, ExternalLink,
  AlertTriangle, Info, ChevronDown, ChevronUp, Loader2,
} from "lucide-react";
import {
  classifyProposalStakes,
  isMorePermissive,
  stakesLabel,
} from "@vouchfx/core";

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
  if (["daily_loss_pct", "max_drawdown_pct", "consistency_pct"].includes(field))
    return `${val}%`;
  if (["news_before_min", "news_after_min"].includes(field))
    return `${val} min`;
  return String(val);
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    daily_loss_pct:          "Daily loss",
    daily_loss_basis:        "Daily loss basis",
    max_drawdown_pct:        "Max drawdown",
    max_drawdown_model:      "Drawdown model",
    consistency_pct:         "Consistency cap",
    news_before_min:         "News window (before)",
    news_after_min:          "News window (after)",
    weekend_holding_allowed: "Weekend holding",
    min_trading_days:        "Min trading days",
    copy_trading_permitted:  "Copy trading",
  };
  return labels[field] ?? field;
}

// ── Diff Table ────────────────────────────────────────────────────────────────

function DiffTable({
  oldValues,
  newValues,
  editMode,
  edited,
  onEdit,
}: {
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  editMode: boolean;
  edited: Record<string, unknown>;
  onEdit: (field: string, val: unknown) => void;
}) {
  // Show only changed fields (exclude internal _reasoning key)
  const fields = Object.keys(newValues).filter((f) => !f.startsWith("_"));

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border">
          <th className="py-2 pr-4 text-left font-medium text-text-muted w-36">Field</th>
          <th className="py-2 pr-4 text-left font-medium text-text-muted">Current</th>
          <th className="py-2 text-left font-medium text-text-muted">
            {editMode ? "Edit proposal" : "Proposed"}
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/50">
        {fields.map((field) => {
          const oldVal = oldValues[field];
          const proposedVal = newValues[field];
          const editedVal = edited[field] ?? proposedVal;
          const permissive = isMorePermissive(field, oldVal, proposedVal);

          return (
            <tr key={field}>
              <td className="py-2 pr-4 text-text-secondary font-medium">
                {fieldLabel(field)}
              </td>
              <td className="py-2 pr-4 text-text-muted tabular-nums">
                {formatFieldValue(field, oldVal)}
              </td>
              <td className="py-2">
                {editMode ? (
                  <EditCell field={field} value={editedVal} onChange={(v) => onEdit(field, v)} />
                ) : (
                  <span className={`tabular-nums font-medium ${
                    permissive ? "text-warning" : "text-profit"
                  }`}>
                    {formatFieldValue(field, proposedVal)}
                    {permissive && (
                      <AlertTriangle size={10} className="inline ml-1 mb-0.5" />
                    )}
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function EditCell({
  field,
  value,
  onChange,
}: {
  field: string;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  if (
    field === "daily_loss_basis" ||
    field === "max_drawdown_model"
  ) {
    const options =
      field === "daily_loss_basis"
        ? ["equity", "balance"]
        : ["static", "eod_trailing", "intraday_trailing"];
    return (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-border bg-surface-elevated px-2 py-0.5 text-xs text-text-primary focus:border-primary focus:outline-none"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  if (field === "weekend_holding_allowed" || field === "copy_trading_permitted") {
    return (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value === "true")}
        className="rounded border border-border bg-surface-elevated px-2 py-0.5 text-xs text-text-primary focus:border-primary focus:outline-none"
      >
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  // Numeric field
  return (
    <input
      type="number"
      step="0.001"
      value={typeof value === "number" || typeof value === "string" ? Number(value) : 0}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-24 rounded border border-border bg-surface-elevated px-2 py-0.5 text-xs text-text-primary focus:border-primary focus:outline-none"
    />
  );
}

// ── Proposal Card ─────────────────────────────────────────────────────────────

function ProposalCard({ proposal, onActioned }: { proposal: Proposal; onActioned: (id: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [edited, setEdited] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState<"approve" | "reject" | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const oldValues = proposal.old_values ?? {};
  const rawNew = proposal.new_values ?? {};
  const { _reasoning, ...newValues } = rawNew as Record<string, unknown>;

  const changedFields = Object.keys(newValues);
  const stakes = classifyProposalStakes(changedFields);
  const isCritical = stakes === "critical";

  const handleEdit = useCallback((field: string, val: unknown) => {
    setEdited((prev) => ({ ...prev, [field]: val }));
  }, []);

  const approve = useCallback(async () => {
    setSaving("approve");
    setError(null);
    try {
      const editedValues = editMode && Object.keys(edited).length > 0
        ? { ...newValues, ...edited }
        : undefined;

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
        setTimeout(() => onActioned(proposal.id), 800);
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
        setTimeout(() => onActioned(proposal.id), 800);
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(null);
    }
  }, [proposal.id, onActioned]);

  if (done) {
    return (
      <div className={`card p-4 flex items-center gap-3 text-sm ${
        done === "approved" ? "border-profit/20 text-profit" : "border-border text-text-muted"
      }`}>
        {done === "approved"
          ? <CheckCircle2 size={16} />
          : <XCircle size={16} />}
        <span>{done === "approved" ? "Published" : "Rejected"}</span>
      </div>
    );
  }

  const firmLabel = proposal.prop_firms?.name ?? proposal.firm_id.slice(0, 8);
  const challengeLabel = proposal.prop_rulesets?.challenge_name ?? "—";
  const currentVersion = proposal.prop_rulesets?.version ?? 1;

  return (
    <div className={`card overflow-hidden border ${
      isCritical ? "border-loss/30" : "border-primary/20"
    }`}>
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-surface-elevated/30"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            isCritical
              ? "bg-loss/10 text-loss border border-loss/20"
              : "bg-primary/10 text-primary border border-primary/20"
          }`}>
            {isCritical ? "Critical" : "Low-stakes"}
          </span>
          <span className="text-sm font-medium text-text-primary truncate">
            {firmLabel}
          </span>
          <span className="text-xs text-text-muted shrink-0">
            {challengeLabel} v{currentVersion}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {proposal.agent_confidence != null && (
            <span className={`text-xs tabular-nums ${
              proposal.agent_confidence >= 0.85 ? "text-profit" :
              proposal.agent_confidence >= 0.6  ? "text-warning" :
                                                  "text-loss"
            }`}>
              {(proposal.agent_confidence * 100).toFixed(0)}% confidence
            </span>
          )}
          <span className="text-xs text-text-muted">{timeAgo(proposal.created_at)}</span>
          {expanded ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {/* Stakes explanation */}
          {isCritical && (
            <div className="flex items-start gap-2 rounded-lg border border-loss/20 bg-loss/5 px-3 py-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-loss" />
              <p className="text-xs text-loss">
                {stakesLabel(stakes)} — changed fields can affect funded account standing.
                Human approval required before publishing.
              </p>
            </div>
          )}

          {/* Diff table */}
          <DiffTable
            oldValues={oldValues}
            newValues={newValues}
            editMode={editMode}
            edited={edited}
            onEdit={handleEdit}
          />

          {/* Claude reasoning */}
          {typeof _reasoning === "string" && _reasoning && (
            <div className="flex items-start gap-2 rounded-lg bg-surface-elevated px-3 py-2">
              <Info size={12} className="mt-0.5 shrink-0 text-text-muted" />
              <p className="text-xs text-text-muted italic">{_reasoning}</p>
            </div>
          )}

          {/* Source link */}
          {proposal.source_url && (
            <a
              href={proposal.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink size={12} />
              Verify source
            </a>
          )}

          {error && <p className="text-xs text-loss">{error}</p>}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1 border-t border-border">
            <button
              onClick={() => { setEditMode((e) => !e); setEdited({}); }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                editMode
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-text-secondary hover:border-primary/50 hover:text-text-primary"
              }`}
            >
              <Edit3 size={12} />
              {editMode ? "Editing" : "Edit values"}
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={reject}
                disabled={saving !== null}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-loss/50 hover:text-loss disabled:opacity-50 transition-colors"
              >
                {saving === "reject" ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                Reject
              </button>
              <button
                onClick={approve}
                disabled={saving !== null}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving === "approve" ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                {editMode ? "Approve with edits" : "Approve & Publish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ApprovalQueue({ proposals }: Props) {
  const [visible, setVisible] = useState(proposals.map((p) => p.id));

  const handleActioned = useCallback((id: string) => {
    setVisible((prev) => prev.filter((v) => v !== id));
  }, []);

  const pendingProposals = proposals.filter((p) => visible.includes(p.id));

  if (pendingProposals.length === 0) {
    return (
      <div className="card p-10 text-center space-y-2">
        <CheckCircle2 size={28} className="mx-auto text-profit" />
        <p className="text-sm font-medium text-text-primary">Queue is empty</p>
        <p className="text-xs text-text-muted">
          No pending rule proposals. The Rule Monitor will surface new ones when changes are detected.
        </p>
      </div>
    );
  }

  const criticalCount = pendingProposals.filter((p) => {
    const fields = Object.keys((p.new_values ?? {}) as Record<string, unknown>)
      .filter((f) => !f.startsWith("_"));
    return classifyProposalStakes(fields) === "critical";
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span>{pendingProposals.length} pending</span>
        {criticalCount > 0 && (
          <span className="text-loss font-medium">{criticalCount} critical</span>
        )}
      </div>

      {pendingProposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} onActioned={handleActioned} />
      ))}
    </div>
  );
}
