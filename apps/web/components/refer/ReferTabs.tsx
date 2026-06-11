"use client";

import { useState } from "react";
import { Copy, Check, Users, DollarSign, Gift, Banknote } from "lucide-react";

interface Stats {
  totalClicks:          number;
  totalSignups:         number;
  totalActiveReferrals: number;
  pendingPayoutUsd:     number;
  lifetimePaidUsd:      number;
  payoutEligible:       boolean;
}

interface ReferralRow { id: string; status: string; first_paid_at: string | null; created_at: string }
interface PayoutRow   { id: string; amount_usd: number; status: string; method: string; paid_at: string | null; created_at: string }

interface Props {
  referralCode: string;
  referralLink: string;
  telegramText: string;
  stats: Stats;
  payoutMethod: string | null;
  referrals: ReferralRow[];
  payouts: PayoutRow[];
  ownReferral: { referral_code: string; first_month_discount_applied: boolean } | null;
}

type Tab = "referral" | "affiliate";
type PayoutMethod = "stripe" | "paystack" | "bank_transfer";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    pending:   "bg-border text-text-muted",
    converted: "bg-profit/20 text-profit",
    churned:   "bg-loss/20 text-loss",
    paid:      "bg-profit/20 text-profit",
    processing:"bg-warning/20 text-warning",
    failed:    "bg-loss/20 text-loss",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold capitalize ${styles[status] ?? "bg-border text-text-muted"}`}>
      {status}
    </span>
  );
}

export default function ReferTabs({
  referralCode, referralLink, telegramText,
  stats, payoutMethod, referrals, payouts, ownReferral,
}: Props) {
  const [tab, setTab] = useState<Tab>("referral");
  const [copiedLink, setCopiedLink]     = useState(false);
  const [copiedMsg, setCopiedMsg]       = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError]   = useState<string | null>(null);
  const [payoutSuccess, setPayoutSuccess] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PayoutMethod>(
    (payoutMethod as PayoutMethod | null) ?? "bank_transfer"
  );

  function copyLink() {
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  }

  function copyMessage() {
    navigator.clipboard.writeText(telegramText).then(() => {
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2000);
    });
  }

  async function requestPayout() {
    setPayoutLoading(true);
    setPayoutError(null);
    try {
      const res = await fetch("/api/affiliate/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: selectedMethod }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; amount_usd?: number };
      if (!res.ok) { setPayoutError(data.error ?? "Payout request failed"); return; }
      setPayoutSuccess(true);
    } catch {
      setPayoutError("Network error");
    } finally {
      setPayoutLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["referral", "affiliate"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {t === "referral" ? "Your referral link" : "Affiliate dashboard"}
          </button>
        ))}
      </div>

      {/* ── Tab: Your referral link ─────────────────────────────────────────── */}
      {tab === "referral" && (
        <div className="space-y-4">
          {/* Referred-by banner */}
          {ownReferral && (
            <div className="card px-4 py-3 text-sm text-text-secondary flex items-center gap-2">
              <Gift size={14} className="text-primary shrink-0" />
              You were referred via code <span className="font-mono text-text-primary">{ownReferral.referral_code}</span>.
              {!ownReferral.first_month_discount_applied && (
                <span className="text-profit"> Your 20% first-month discount will apply at checkout.</span>
              )}
            </div>
          )}

          {/* How it works */}
          <div className="card p-4 space-y-2">
            <p className="text-sm font-medium text-text-primary">How it works</p>
            <ul className="space-y-1 text-xs text-text-secondary list-disc list-inside">
              <li>Share your link — anyone who signs up is attributed to you for life.</li>
              <li>When they pay, you earn <strong className="text-text-primary">20% of every payment</strong> as account credit.</li>
              <li>They get <strong className="text-text-primary">20% off their first month</strong>.</li>
              <li>Reach $50 to request a payout (monthly cycle).</li>
            </ul>
          </div>

          {/* Your code */}
          <div className="card p-4 space-y-3">
            <p className="text-xs text-text-muted uppercase tracking-wide font-medium">Your referral code</p>
            <p className="font-mono text-2xl font-bold text-primary tracking-widest">{referralCode}</p>

            <div className="flex items-center gap-2 rounded-md border border-border bg-surface-elevated px-3 py-2">
              <span className="flex-1 truncate text-sm text-text-secondary font-mono">{referralLink}</span>
              <button
                onClick={copyLink}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors shrink-0"
              >
                {copiedLink ? <Check size={12} /> : <Copy size={12} />}
                {copiedLink ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Template Telegram message */}
          <div className="card p-4 space-y-3">
            <p className="text-xs text-text-muted uppercase tracking-wide font-medium">Ready-to-send message</p>
            <pre className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed bg-surface-elevated rounded p-3">{telegramText}</pre>
            <button
              onClick={copyMessage}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {copiedMsg ? <Check size={12} /> : <Copy size={12} />}
              {copiedMsg ? "Copied!" : "Copy message"}
            </button>
          </div>

          {/* Quick earnings preview */}
          {stats.pendingPayoutUsd > 0 && (
            <div className="card px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <DollarSign size={14} className="text-profit" />
                Pending earnings
              </div>
              <span className="num font-semibold text-profit">${stats.pendingPayoutUsd.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Affiliate dashboard ────────────────────────────────────────── */}
      {tab === "affiliate" && (
        <div className="space-y-4">
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Clicks",          value: stats.totalClicks,          icon: <Copy size={13} /> },
              { label: "Signups",         value: stats.totalSignups,         icon: <Users size={13} /> },
              { label: "Active referrals",value: stats.totalActiveReferrals, icon: <Users size={13} /> },
              { label: "Lifetime paid",   value: `$${stats.lifetimePaidUsd.toFixed(2)}`, icon: <DollarSign size={13} />, raw: true },
            ].map((s) => (
              <div key={s.label} className="card p-4">
                <div className="flex items-center gap-1 text-text-muted text-xs mb-1">{s.icon}{s.label}</div>
                <p className="num text-xl font-bold text-text-primary">{s.raw ? s.value : s.value}</p>
              </div>
            ))}
          </div>

          {/* Pending payout + request */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wide font-medium">Pending balance</p>
                <p className={`num text-2xl font-bold mt-0.5 ${stats.pendingPayoutUsd >= 50 ? "text-profit" : "text-text-primary"}`}>
                  ${stats.pendingPayoutUsd.toFixed(2)}
                </p>
              </div>
              <div className="text-xs text-text-muted text-right">
                <p>Min. payout: <span className="num">$50.00</span></p>
                <p className="mt-0.5">{stats.payoutEligible ? "✓ Eligible" : `Need $${(50 - stats.pendingPayoutUsd).toFixed(2)} more`}</p>
              </div>
            </div>

            {stats.payoutEligible && !payoutSuccess && (
              <div className="space-y-2">
                <label className="text-xs text-text-muted">Payout method</label>
                <div className="flex gap-2">
                  {(["bank_transfer", "paystack", "stripe"] as PayoutMethod[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setSelectedMethod(m)}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                        selectedMethod === m
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-text-secondary hover:border-primary/50"
                      }`}
                    >
                      {m === "bank_transfer" ? "Bank / Wise" : m === "paystack" ? "Paystack (NGN)" : "Stripe"}
                    </button>
                  ))}
                </div>
                <button
                  onClick={requestPayout}
                  disabled={payoutLoading}
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-[#04201D] hover:bg-primary/90 disabled:opacity-50"
                >
                  {payoutLoading ? "Submitting…" : `Request payout — $${stats.pendingPayoutUsd.toFixed(2)}`}
                </button>
                {payoutError && <p className="text-xs text-loss">{payoutError}</p>}
              </div>
            )}

            {payoutSuccess && (
              <p className="text-sm text-profit flex items-center gap-1.5">
                <Check size={14} /> Payout request submitted — we&apos;ll process it within the monthly cycle.
              </p>
            )}
          </div>

          {/* Referrals list */}
          {referrals.length > 0 && (
            <div className="card divide-y divide-border">
              <div className="px-4 py-2.5 text-xs text-text-muted uppercase tracking-wide font-medium">
                Referrals ({referrals.length})
              </div>
              {referrals.map((r) => (
                <div key={r.id} className="px-4 py-3 flex items-center justify-between text-sm">
                  <span className="text-text-secondary">{fmtDate(r.created_at)}</span>
                  <div className="flex items-center gap-2">
                    {r.first_paid_at && (
                      <span className="text-xs text-text-muted">Converted {fmtDate(r.first_paid_at)}</span>
                    )}
                    {statusBadge(r.status)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Payout history */}
          {payouts.length > 0 && (
            <div className="card divide-y divide-border">
              <div className="px-4 py-2.5 text-xs text-text-muted uppercase tracking-wide font-medium flex items-center gap-1.5">
                <Banknote size={12} /> Payout history
              </div>
              {payouts.map((p) => (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="num text-text-primary font-medium">${Number(p.amount_usd).toFixed(2)}</span>
                    <span className="text-xs text-text-muted ml-2">{p.method === "bank_transfer" ? "Bank / Wise" : p.method}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.paid_at && <span className="text-xs text-text-muted">{fmtDate(p.paid_at)}</span>}
                    {statusBadge(p.status)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {referrals.length === 0 && payouts.length === 0 && (
            <div className="card px-4 py-8 text-center text-sm text-text-muted">
              No referrals yet — share your link to get started.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
