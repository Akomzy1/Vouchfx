"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

type ExecutionMode = "apply_my_rules" | "mirror_provider";

interface Props {
  onComplete: () => void;
  onSkip: () => void;
}

export default function StepRisk({ onComplete, onSkip }: Props) {
  const [riskPct, setRiskPct]           = useState("1");
  const [dailyLimit, setDailyLimit]     = useState("5");
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("apply_my_rules");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);

  async function handleSave(e: { preventDefault(): void }) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/risk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          risk_per_trade_pct:  parseFloat(riskPct) || 1,
          daily_signal_limit:  parseInt(dailyLimit, 10) || 5,
          sizing_mode:         "percent_balance",
          default_sl_policy:   "skip",
          execution_mode:      executionMode,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "Save failed"); return; }
      onComplete();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Set risk limits</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          These defaults keep you safe. You can fine-tune everything later in Risk settings.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-3">

        {/* Execution mode */}
        <div className="space-y-1.5">
          <label className="text-xs text-text-muted">Execution mode</label>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setExecutionMode("apply_my_rules")}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                executionMode === "apply_my_rules"
                  ? "bg-primary text-[#04201D]"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Apply my risk rules
            </button>
            <button
              type="button"
              onClick={() => setExecutionMode("mirror_provider")}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                executionMode === "mirror_provider"
                  ? "bg-primary text-[#04201D]"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Mirror provider
            </button>
          </div>
          {executionMode === "mirror_provider" && (
            <p className="text-xs text-text-muted">
              Provider SL and TP levels are copied as-is. Daily limits and loss cap still apply. Configure lot sizing in Risk settings.
            </p>
          )}
        </div>

        {/* Risk per trade (only shown in apply_my_rules) */}
        {executionMode === "apply_my_rules" && (
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Risk per trade (%)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0.25"
                max="5"
                step="0.25"
                value={riskPct}
                onChange={(e) => setRiskPct(e.target.value)}
                className="flex-1 accent-primary"
              />
              <span className="num w-12 text-right text-sm font-semibold text-text-primary">{riskPct}%</span>
            </div>
            <p className="text-2xs text-text-muted">On a $10,000 account at 1%: max $100 risk per trade.</p>
          </div>
        )}

        {/* Daily signal limit */}
        <div className="space-y-1">
          <label className="text-xs text-text-muted">Max signals per day</label>
          <div className="flex gap-2">
            {[3, 5, 10, 0].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setDailyLimit(String(v))}
                className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                  dailyLimit === String(v)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-text-secondary hover:border-primary/40"
                }`}
              >
                {v === 0 ? "Unlimited" : v}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs text-warning">
          {executionMode === "apply_my_rules"
            ? "Without a stop loss, signals will be skipped by default. You can change this in Risk settings."
            : "In mirror mode, signals with no stop loss will be skipped unless you enable the override in Risk settings."}
        </div>

        {error && <p className="text-xs text-loss">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={loading} className="btn-primary flex-1 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : "Save & continue"}
          </button>
          <button type="button" onClick={onSkip} className="btn-ghost px-3">Use defaults</button>
        </div>
      </form>
    </div>
  );
}
