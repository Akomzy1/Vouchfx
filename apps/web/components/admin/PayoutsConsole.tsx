"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, XCircle, Clock, Banknote, AlertCircle } from "lucide-react";

export interface AdminPayout {
  id: string;
  user_id: string;
  amount_usd: number;
  status: "pending" | "processing" | "paid" | "failed";
  method: string;
  provider_transfer_id: string | null;
  failure_reason: string | null;
  processed_by: string | null;
  paid_at: string | null;
  created_at: string;
  affiliate_email: string | null;
  referral_code: string | null;
}

const STATUS_STYLE: Record<AdminPayout["status"], string> = {
  pending:    "border-warning/30 bg-warning/10 text-warning",
  processing: "border-primary/30 bg-primary/10 text-primary-light",
  paid:       "border-profit/30 bg-profit/10 text-profit",
  failed:     "border-loss/30 bg-loss/10 text-loss",
};

function fmtUSD(n: number): string {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PayoutsConsole({ initial }: { initial: AdminPayout[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | AdminPayout["status"]>("all");

  const rows = filter === "all" ? initial : initial.filter((p) => p.status === filter);

  async function act(id: string, action: "approve" | "paid" | "failed") {
    setError(null);
    let reference: string | undefined;
    let reason: string | undefined;
    if (action === "paid") {
      reference = window.prompt("Payment reference / transfer ID (recorded on the payout):")?.trim() || undefined;
    }
    if (action === "failed") {
      reason = window.prompt("Reason this payout failed (returned to the affiliate's balance):")?.trim() || undefined;
      if (!reason) return;
    }
    setBusyId(id);
    const res = await fetch(`/api/admin/payouts/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reference, reason }),
    });
    setBusyId(null);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setError(b?.error ?? "Action failed.");
      return;
    }
    router.refresh();
  }

  const pendingTotal = initial
    .filter((p) => p.status === "pending" || p.status === "processing")
    .reduce((s, p) => s + Number(p.amount_usd), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Banknote size={16} className="text-text-muted" />
          <span className="num font-medium text-text-primary">{fmtUSD(pendingTotal)}</span> in-flight across
          pending + processing requests
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-lg border border-border bg-surface-elevated px-2 py-1 text-xs text-text-primary"
        >
          {["all", "pending", "processing", "paid", "failed"].map((s) => (
            <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">
          <AlertCircle size={12} /> {error}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-text-muted">
          No payout requests {filter !== "all" ? `with status "${filter}"` : "yet"}.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-2xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Affiliate</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-left font-medium">Method</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Requested</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((p) => (
                <tr key={p.id} className="bg-bg">
                  <td className="px-3 py-2.5">
                    <div className="text-text-primary">{p.affiliate_email ?? p.user_id.slice(0, 8)}</div>
                    <div className="text-2xs text-text-muted">{p.referral_code ?? "—"}</div>
                  </td>
                  <td className="num px-3 py-2.5 text-right text-text-primary">{fmtUSD(p.amount_usd)}</td>
                  <td className="px-3 py-2.5 text-text-secondary">{p.method.replace("_", " ")}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium ${STATUS_STYLE[p.status]}`}>
                      {p.status === "paid" ? <CheckCircle2 size={10} /> : p.status === "failed" ? <XCircle size={10} /> : <Clock size={10} />}
                      {p.status}
                    </span>
                    {p.status === "failed" && p.failure_reason && (
                      <div className="mt-0.5 text-2xs text-text-muted">{p.failure_reason}</div>
                    )}
                    {p.status === "paid" && p.provider_transfer_id && (
                      <div className="num mt-0.5 text-2xs text-text-muted">ref {p.provider_transfer_id}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-text-muted">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2.5 text-right">
                    {busyId === p.id ? (
                      <Loader2 size={14} className="ml-auto animate-spin text-text-muted" />
                    ) : p.status === "pending" || p.status === "processing" ? (
                      <div className="flex justify-end gap-1.5">
                        {p.status === "pending" && (
                          <button onClick={() => act(p.id, "approve")} className="btn-ghost px-2 py-1 text-2xs">Approve</button>
                        )}
                        <button onClick={() => act(p.id, "paid")} className="btn-primary px-2 py-1 text-2xs">Mark paid</button>
                        <button onClick={() => act(p.id, "failed")} className="px-2 py-1 text-2xs text-loss hover:underline">Failed</button>
                      </div>
                    ) : (
                      <span className="text-2xs text-text-muted">{p.processed_by ?? "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-2xs text-text-muted">
        Disbursement is manual: send the money via the chosen method, then record it here. Marking
        <span className="text-text-secondary"> Paid</span> clears the locked balance; marking
        <span className="text-text-secondary"> Failed</span> returns it to the affiliate&rsquo;s pending balance.
      </p>
    </div>
  );
}
