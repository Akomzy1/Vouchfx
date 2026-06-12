"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  onComplete: () => void;
  onSkip: () => void;
}

export default function StepBroker({ onComplete, onSkip }: Props) {
  const [login, setLogin]     = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer]   = useState("");
  const [label, setLabel]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!login || !password || !server) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/broker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: Number(login), password, server, label: label || undefined, platform: "MT5" }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "Connection failed"); return; }
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
        <h2 className="text-lg font-semibold text-text-primary">Connect your broker</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Enter your MT5 credentials. VouchFX uses MetaApi — your password is passed through once, never stored here.
        </p>
      </div>

      {/* Demo-account note (PRD R6: demo and live are treated identically) */}
      <p className="rounded-lg border border-border bg-surface-elevated/60 px-3 py-2.5 text-xs leading-relaxed text-text-secondary">
        Want to test first? Connect your broker&rsquo;s{" "}
        <strong className="text-text-primary">free demo account</strong> — VouchFX works identically
        on demo and live.
      </p>

      <form onSubmit={handleConnect} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Account number</label>
            <input
              type="number"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="12345678"
              required
              className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Label (optional)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My funded account"
              className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-text-muted">Server</label>
          <input
            type="text"
            value={server}
            onChange={(e) => setServer(e.target.value)}
            placeholder="ICMarkets-Live"
            required
            className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-text-muted">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {error && <p className="text-xs text-loss">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={loading} className="btn-primary flex-1 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : "Connect"}
          </button>
          <button type="button" onClick={onSkip} className="btn-ghost px-3">Skip</button>
        </div>
      </form>
    </div>
  );
}
