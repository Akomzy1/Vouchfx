import { Gift, Copy } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { REFERRAL_AFFILIATE_ENABLED } from "@/lib/flags";

export const metadata: Metadata = { title: "Refer & Earn" };

export default function ReferralsPage() {
  // Referral/affiliate program deferred at launch — hide the screen entirely.
  if (!REFERRAL_AFFILIATE_ENABLED) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Refer &amp; Earn</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Earn 20% recurring for every trader you refer. Give 20% off, get 20% credit.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Referral link</p>
          <div className="flex items-center gap-2 mt-2">
            <code className="num flex-1 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs text-text-primary truncate">
              vouchfx.com/r/you
            </code>
            <button className="btn-ghost p-2" aria-label="Copy">
              <Copy size={14} />
            </button>
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Earnings</p>
          <div className="flex items-baseline gap-1">
            <span className="num text-2xl font-bold text-text-primary">$0.00</span>
            <span className="text-xs text-text-muted">pending</span>
          </div>
          <p className="text-xs text-text-muted">$50 minimum to withdraw</p>
        </div>
      </div>

      <div className="card p-10 text-center space-y-3">
        <Gift size={32} className="mx-auto text-text-muted" />
        <p className="font-medium text-text-primary">Referral program coming soon</p>
        <p className="text-sm text-text-secondary max-w-xs mx-auto">
          Full referral dashboard, affiliate tracking, and payouts. Coming in P1.24.
        </p>
      </div>
    </div>
  );
}
