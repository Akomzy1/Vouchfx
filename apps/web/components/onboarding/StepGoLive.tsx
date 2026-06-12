"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Zap, AlertTriangle, ShieldCheck } from "lucide-react";

interface Props {
  allDone: boolean; // Telegram + channels + broker all connected
}

export default function StepGoLive({ allDone }: Props) {
  const router = useRouter();
  const [disclaimer, setDisclaimer] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  async function handleLaunch() {
    if (!disclaimer) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Failed to save");
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-primary mx-auto mb-3">
          <Zap size={22} />
        </div>
        <h2 className="text-lg font-semibold text-text-primary">Ready to launch</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          VouchFX will start watching your channels and executing under your risk rules.
        </p>
      </div>

      {!allDone && (
        <p className="flex items-center gap-1.5 rounded-xl border border-warning/25 bg-warning/[0.06] px-3.5 py-2.5 text-xs text-warning">
          <AlertTriangle size={12} className="shrink-0" />
          Some setup steps are incomplete — you can finish them from the dashboard, but signals won&rsquo;t execute until Telegram, channels, and broker are connected.
        </p>
      )}

      {/* Demo-account note (PRD R6: demo and live are treated identically) */}
      <p className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-elevated/50 px-3.5 py-3 text-xs leading-relaxed text-text-secondary">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary-light" />
        <span>
          Want to test first? Connect your broker&rsquo;s <span className="text-text-primary">free demo account</span> —
          VouchFX works identically on demo and live.
        </span>
      </p>

      {/* Risk disclaimer — required (VCH-ONB-02) */}
      <label className="flex items-start gap-3 cursor-pointer">
        <div
          onClick={() => setDisclaimer((v) => !v)}
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${
            disclaimer ? "border-primary bg-primary text-[#04201D]" : "border-border"
          }`}
        >
          {disclaimer && <CheckCircle2 size={10} />}
        </div>
        <span className="text-xs text-text-secondary leading-relaxed">
          I understand VouchFX is an <strong className="text-text-primary">execution tool I control</strong>, not financial advice, not a managed account, and not a signal recommendation service.
          I accept full responsibility for all trading decisions and any resulting losses.
        </span>
      </label>

      {error && <p className="text-xs text-loss">{error}</p>}

      <button
        onClick={handleLaunch}
        disabled={!disclaimer || loading}
        className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : "Launch VouchFX"}
      </button>

      <p className="text-center text-2xs text-text-muted">
        You can change all settings at any time from the dashboard.
      </p>
    </div>
  );
}
