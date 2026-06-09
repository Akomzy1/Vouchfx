import { Shield } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Risk Settings" };

export default function RiskPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Risk Settings</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Position sizing, daily limits, and drawdown protection.
        </p>
      </div>

      <div className="card p-10 text-center space-y-3">
        <Shield size={32} className="mx-auto text-text-muted" />
        <p className="font-medium text-text-primary">Risk settings coming soon</p>
        <p className="text-sm text-text-secondary max-w-xs mx-auto">
          Configure execution mode, position sizing, daily signal limits, and drawdown guardian. Coming in P1.14–P1.16.
        </p>
      </div>
    </div>
  );
}
