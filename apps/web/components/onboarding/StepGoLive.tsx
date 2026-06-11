"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Zap, AlertTriangle } from "lucide-react";

interface Props {
  allDone: boolean; // Telegram + channels + broker all connected
}

export default function StepGoLive({ allDone }: Props) {
  const router = useRouter();
  const [demoMode, setDemoMode]       = useState(!allDone); // default to demo if setup incomplete
  const [disclaimer, setDisclaimer]   = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  async function handleLaunch() {
    if (!disclaimer) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demoMode }),
      });
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
          Choose how you want to start copying signals.
        </p>
      </div>

      {/* Demo-first option */}
      <div className="space-y-2">
        <p className="text-xs text-text-muted font-medium uppercase tracking-wide">Start mode</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setDemoMode(true)}
            className={`rounded-lg border p-3 text-left transition-colors ${
              demoMode
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/40"
            }`}
          >
            <p className="text-sm font-semibold text-text-primary">Demo first</p>
            <p className="text-xs text-text-secondary mt-0.5">
              Signals execute on a paper account. Promote to live when ready.
            </p>
          </button>
          <button
            onClick={() => setDemoMode(false)}
            disabled={!allDone}
            className={`rounded-lg border p-3 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              !demoMode
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/40"
            }`}
          >
            <p className="text-sm font-semibold text-text-primary">Go live now</p>
            <p className="text-xs text-text-secondary mt-0.5">
              Signals execute on your real broker account immediately.
            </p>
          </button>
        </div>
        {!allDone && !demoMode && (
          <p className="text-xs text-warning flex items-center gap-1">
            <AlertTriangle size={11} />
            Complete Telegram, channels and broker setup to go live.
          </p>
        )}
      </div>

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
        {loading
          ? <Loader2 size={14} className="animate-spin" />
          : demoMode ? "Launch in demo mode" : "Launch VouchFX"}
      </button>

      <p className="text-center text-2xs text-text-muted">
        You can change all settings at any time from the dashboard.
      </p>
    </div>
  );
}
