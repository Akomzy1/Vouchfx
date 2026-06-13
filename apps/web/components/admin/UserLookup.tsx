"use client";

import { useState } from "react";
import {
  Search, Loader2, Send, Server, CreditCard, Gift, AlertCircle, CircleDot, Ban, RotateCcw,
} from "lucide-react";

interface Broker {
  label: string | null; platform: string; is_active: boolean; status: string | null;
  account_mode: string | null; is_primary: boolean; last_balance_usd: number | null; last_synced_at: string | null;
}
interface Sub {
  plan: string; status: string; provider: string;
  current_period_end: string | null; trial_ends_at: string | null; cancelled_at: string | null;
}
interface AdminUser {
  id: string; email: string; full_name: string | null; referral_code: string | null;
  created_at: string; onboarding_completed_at: string | null;
  subscription: Sub | null;
  brokers: Broker[];
  telegram: { status: string; last_connected_at: string | null } | null;
  trades_30d: number;
  recent_trades: { symbol: string; side: string; status: string; created_at: string }[];
  affiliate: {
    referral_code: string; total_signups: number; total_active_referrals: number;
    pending_payout_usd: number; locked_payout_usd: number; lifetime_paid_usd: number;
  } | null;
  referred_by: { referrer_id: string; status: string } | null;
}

const dot = (ok: boolean) => (ok ? "text-profit" : "text-text-muted");

export default function UserLookup() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/lookup?q=${encodeURIComponent(q.trim())}`);
      const b = await res.json();
      if (!res.ok) throw new Error(b?.error ?? "Lookup failed");
      setUsers(b.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function subscriptionAction(u: AdminUser, action: "cancel" | "refund") {
    if (!u.subscription) return;
    const confirmMsg = action === "cancel"
      ? `Cancel ${u.email}'s ${u.subscription.plan} subscription at period end?`
      : `Refund ${u.email}'s most recent payment? This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;
    setActingId(u.id);
    setError(null);
    const res = await fetch("/api/admin/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id, action }),
    });
    setActingId(null);
    const b = await res.json().catch(() => null);
    if (!res.ok) { setError(b?.error ?? "Action failed"); return; }
    void search({ preventDefault() {} } as React.FormEvent);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by email or user ID…"
            className="w-full rounded-lg border border-border bg-surface-elevated py-2 pl-9 pr-3 text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary text-sm disabled:opacity-50">
          {loading ? <Loader2 size={15} className="animate-spin" /> : "Search"}
        </button>
      </form>

      {error && (
        <p className="flex items-center gap-1.5 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">
          <AlertCircle size={12} /> {error}
        </p>
      )}

      {users?.length === 0 && (
        <p className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-text-muted">No users match “{q}”.</p>
      )}

      {(users ?? []).map((u) => {
        const brokerOk = u.brokers.some((b) => b.is_active && (b.status === "connected" || b.is_active));
        const tgOk = u.telegram?.status === "active";
        return (
          <div key={u.id} className="space-y-3 rounded-xl border border-border bg-surface p-4">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-text-primary">{u.full_name ?? u.email}</p>
                <p className="text-xs text-text-muted">{u.email} · <span className="num">{u.id.slice(0, 8)}</span></p>
              </div>
              <div className="text-right text-2xs text-text-muted">
                joined {new Date(u.created_at).toLocaleDateString()}
                {!u.onboarding_completed_at && <span className="ml-1 text-warning">· onboarding incomplete</span>}
              </div>
            </div>

            {/* Status grid */}
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div className="flex items-center gap-1.5">
                <CreditCard size={13} className="text-text-muted" />
                <span className="text-text-secondary">
                  {u.subscription ? `${u.subscription.plan} · ${u.subscription.status}` : "no subscription"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Server size={13} className={dot(brokerOk)} />
                <span className="text-text-secondary">
                  {u.brokers.length ? `${u.brokers.length} broker${u.brokers.length > 1 ? "s" : ""}` : "no broker"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Send size={13} className={dot(!!tgOk)} />
                <span className="text-text-secondary">TG {u.telegram?.status ?? "none"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CircleDot size={13} className="text-text-muted" />
                <span className="text-text-secondary">{u.trades_30d} trades / 30d</span>
              </div>
            </div>

            {/* Brokers detail */}
            {u.brokers.length > 0 && (
              <div className="rounded-lg border border-border bg-bg p-2.5 text-2xs text-text-secondary">
                {u.brokers.map((b, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{b.label ?? b.platform} {b.is_primary && <span className="text-primary-light">· primary</span>} {b.account_mode && <span className="text-text-muted">({b.account_mode})</span>}</span>
                    <span className="num">{b.last_balance_usd != null ? `$${b.last_balance_usd.toLocaleString()}` : "—"}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Referral / affiliate */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-text-muted">
              <span className="flex items-center gap-1"><Gift size={11} /> code {u.referral_code ?? "—"}</span>
              {u.affiliate && (
                <>
                  <span>{u.affiliate.total_signups} signups · {u.affiliate.total_active_referrals} active</span>
                  <span className="num">pending ${Number(u.affiliate.pending_payout_usd).toFixed(2)}</span>
                  <span className="num">locked ${Number(u.affiliate.locked_payout_usd).toFixed(2)}</span>
                  <span className="num">paid ${Number(u.affiliate.lifetime_paid_usd).toFixed(2)}</span>
                </>
              )}
              {u.referred_by && <span>referred by <span className="num">{u.referred_by.referrer_id.slice(0, 8)}</span> ({u.referred_by.status})</span>}
            </div>

            {/* Subscription actions (VCH-ADMIN-07) */}
            {u.subscription && u.subscription.status !== "cancelled" && (
              <div className="flex items-center gap-2 border-t border-border pt-2">
                {actingId === u.id ? (
                  <Loader2 size={14} className="animate-spin text-text-muted" />
                ) : (
                  <>
                    <button onClick={() => subscriptionAction(u, "cancel")} className="flex items-center gap-1 text-2xs text-text-secondary hover:text-loss">
                      <Ban size={11} /> Cancel subscription
                    </button>
                    {u.subscription.provider === "stripe" && (
                      <button onClick={() => subscriptionAction(u, "refund")} className="flex items-center gap-1 text-2xs text-text-secondary hover:text-loss">
                        <RotateCcw size={11} /> Refund last payment
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
