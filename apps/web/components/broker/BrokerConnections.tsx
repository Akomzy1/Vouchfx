"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2, AlertCircle, CheckCircle, Server, Star } from "lucide-react";
import StatusPill from "@/components/ui/StatusPill";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrokerConnectionRow {
  id: string;
  label: string | null;
  platform: string;
  is_active: boolean;
  /** The account shown on the dashboard. At most one per user. */
  is_primary: boolean;
  /** Whether new signals copy to this account (VCH-BRK-04 multi-account). */
  copy_enabled: boolean;
  status: "deploying" | "connected" | "disconnected" | "error";
  /** demo | live — from MetaApi account info; null until first sync. */
  account_mode: "demo" | "live" | null;
  server_hint: string | null;
  last_status_at: string | null;
  created_at: string;
}

/** Demo/live badge — derived from MetaApi account info, cached by the executor. */
function AccountModeBadge({ mode }: { mode: "demo" | "live" | null }) {
  if (!mode) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        mode === "live"
          ? "border-profit/30 bg-profit/10 text-profit"
          : "border-warning/30 bg-warning/10 text-warning"
      }`}
      title={mode === "live" ? "Real-money account" : "Broker demo account — no real funds at risk"}
    >
      {mode}
    </span>
  );
}

interface BrokerConnectionsProps {
  initialConnections: BrokerConnectionRow[];
}

// ─── Connection card ──────────────────────────────────────────────────────────

function ConnectionCard({
  conn,
  multiple,
  onRemove,
  onMakePrimary,
  onToggleCopy,
}: {
  conn: BrokerConnectionRow;
  multiple: boolean;
  onRemove: (id: string) => void;
  onMakePrimary: (id: string) => Promise<void>;
  onToggleCopy: (id: string, enabled: boolean) => Promise<void>;
}) {
  const [status, setStatus] = useState(conn.status);
  const [removing, setRemoving] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [copyEnabled, setCopyEnabled] = useState(conn.copy_enabled);
  const [togglingCopy, setTogglingCopy] = useState(false);

  async function handleToggleCopy() {
    const next = !copyEnabled;
    setCopyEnabled(next); // optimistic
    setTogglingCopy(true);
    try {
      await onToggleCopy(conn.id, next);
    } catch {
      setCopyEnabled(!next); // revert on failure
    } finally {
      setTogglingCopy(false);
    }
  }

  // Poll for status while deploying
  useEffect(() => {
    if (status !== "deploying") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/broker/${conn.id}/status`);
        const json = await res.json();
        if (json.status && json.status !== status) {
          setStatus(json.status as typeof status);
        }
        if (json.status !== "deploying") clearInterval(interval);
      } catch {
        // non-fatal, keep polling
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [conn.id, status]);

  async function handleRemove() {
    if (!confirm(`Remove "${conn.label ?? "this account"}"? This cannot be undone.`)) return;
    setRemoving(true);
    try {
      await fetch(`/api/broker/${conn.id}`, { method: "DELETE" });
      onRemove(conn.id);
    } catch {
      setRemoving(false);
    }
  }

  async function handleMakePrimary() {
    setPromoting(true);
    try {
      await onMakePrimary(conn.id);
    } finally {
      setPromoting(false);
    }
  }

  const canMakePrimary = multiple && !conn.is_primary && status !== "deploying";

  const pillStatus =
    status === "connected" ? "connected" :
    status === "deploying" ? "paused" :
    "disconnected";

  const statusLabel =
    status === "connected" ? "Connected" :
    status === "deploying" ? "Deploying…" :
    status === "error" ? "Error" : "Disconnected";

  return (
    <div className="flex items-center justify-between py-3 px-1 border-b border-border last:border-0">
      <div className="flex items-start gap-3 min-w-0">
        <Server size={14} className="text-text-muted mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-text-primary truncate">
            {conn.label ?? `${conn.platform} Account`}
            <AccountModeBadge mode={conn.account_mode} />
            {conn.is_primary && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-light"
                title="New signals route to this account"
              >
                <Star size={9} className="fill-current" /> Primary
              </span>
            )}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <StatusPill status={pillStatus} label={statusLabel} />
            {conn.server_hint && (
              <span className="text-xs text-text-muted truncate">{conn.server_hint}</span>
            )}
          </div>
        </div>
      </div>
      <div className="ml-3 flex shrink-0 items-center gap-3">
        {/* Copy-signals toggle (VCH-BRK-04): a signal copies to every enabled account. */}
        <button
          onClick={handleToggleCopy}
          disabled={togglingCopy || status === "deploying"}
          className="flex items-center gap-1.5 disabled:opacity-40"
          title={copyEnabled ? "Signals copy to this account" : "Signals do NOT copy to this account"}
          aria-pressed={copyEnabled}
          aria-label="Copy signals to this account"
        >
          <span className={`relative h-4 w-7 rounded-full transition-colors ${copyEnabled ? "bg-primary" : "bg-border"}`}>
            <span
              className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${copyEnabled ? "translate-x-[15px]" : "translate-x-0.5"}`}
            />
          </span>
          <span className="hidden text-xs font-medium text-text-secondary sm:inline">Copy</span>
        </button>
        {canMakePrimary && (
          <button
            onClick={handleMakePrimary}
            disabled={promoting}
            className="flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-primary disabled:opacity-40 transition-colors"
          >
            {promoting ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />}
            Make primary
          </button>
        )}
        <button
          onClick={handleRemove}
          disabled={removing}
          className="text-text-muted hover:text-loss disabled:opacity-40 transition-colors"
          aria-label={`Remove ${conn.label ?? "broker account"}`}
        >
          {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  );
}

// ─── Add form ─────────────────────────────────────────────────────────────────

function AddBrokerForm({ onAdded, onCancel }: {
  onAdded: (conn: BrokerConnectionRow) => void;
  onCancel: () => void;
}) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [label, setLabel] = useState("");
  const [platform, setPlatform] = useState<"mt5" | "mt4">("mt5");
  const [region, setRegion] = useState("new-york");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/broker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password, server, label, platform, region }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add account");
      onAdded(json.connection as BrokerConnectionRow);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      {/* Demo-account note (PRD R6: demo and live are treated identically) */}
      <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-elevated/60 px-3 py-2.5 text-xs leading-relaxed text-text-secondary">
        <CheckCircle size={13} className="mt-0.5 shrink-0 text-primary" />
        <span>
          Want to test first? Connect your broker&rsquo;s{" "}
          <strong className="text-text-primary">free demo account</strong> — VouchFX works
          identically on demo and live.
        </span>
      </p>

      {/* Platform toggle */}
      <div className="flex rounded-lg border border-border overflow-hidden">
        {(["mt5", "mt4"] as const).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
              platform === p
                ? "bg-primary/10 text-primary"
                : "text-text-muted hover:text-text-primary"
            } ${p === "mt4" ? "border-l border-border" : ""}`}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">Account number</label>
          <input
            type="text"
            required
            value={login}
            onChange={e => setLogin(e.target.value)}
            placeholder="12345678"
            className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">Broker server</label>
        <input
          type="text"
          required
          value={server}
          onChange={e => setServer(e.target.value)}
          placeholder="ICMarketsSC-Demo02"
          className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono"
        />
        <p className="text-xs text-text-muted">
          Find this in your broker&apos;s email or MT5 app → File → Open an Account.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">Label (optional)</label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="My Demo"
            className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">Region</label>
          <select
            value={region}
            onChange={e => setRegion(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="new-york">New York (US)</option>
            <option value="london">London (EU)</option>
            <option value="singapore">Singapore (AS)</option>
            <option value="sydney">Sydney (AU)</option>
            <option value="frankfurt">Frankfurt (DE)</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-loss/30 bg-red-900/20 px-3 py-2 text-xs text-loss">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost flex-1 text-sm">
          Cancel
        </button>
        <button type="submit" disabled={loading} className="btn-primary flex-1 text-sm disabled:opacity-50">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Connecting…
            </span>
          ) : "Add account"}
        </button>
      </div>

      <p className="text-xs text-text-muted">
        Your credentials are forwarded to MetaApi for broker authentication and{" "}
        <strong className="text-text-secondary">never stored</strong> by VouchFX.
        Only a MetaApi account ID is kept.
      </p>
    </form>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function BrokerConnections({ initialConnections }: BrokerConnectionsProps) {
  const [connections, setConnections] = useState<BrokerConnectionRow[]>(initialConnections);
  const [adding, setAdding] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleAdded = useCallback((conn: BrokerConnectionRow) => {
    setConnections(prev => [conn, ...prev]);
    setAdding(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }, []);

  const handleRemove = useCallback((id: string) => {
    setConnections(prev => {
      const removed = prev.find(c => c.id === id);
      const rest = prev.filter(c => c.id !== id);
      // Mirror the API's successor promotion: if the primary was removed,
      // promote the oldest remaining account so the badge stays accurate.
      if (removed?.is_primary && rest.length > 0 && !rest.some(c => c.is_primary)) {
        const successor = [...rest].sort((a, b) => {
          if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
          return a.created_at.localeCompare(b.created_at);
        })[0];
        if (successor) {
          return rest.map(c => (c.id === successor.id ? { ...c, is_primary: true } : c));
        }
      }
      return rest;
    });
  }, []);

  const handleMakePrimary = useCallback(async (id: string) => {
    const res = await fetch(`/api/broker/${id}/primary`, { method: "POST" });
    if (!res.ok) return;
    setConnections(prev => prev.map(c => ({ ...c, is_primary: c.id === id })));
  }, []);

  const handleToggleCopy = useCallback(async (id: string, enabled: boolean) => {
    const res = await fetch(`/api/broker/${id}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error("toggle failed"); // card reverts its optimistic state
    setConnections(prev => prev.map(c => (c.id === id ? { ...c, copy_enabled: enabled } : c)));
  }, []);

  return (
    <div className="space-y-3">
      {/* Connected accounts list */}
      {connections.length > 0 && !adding && (
        <div className="card px-4 py-0">
          {connections.map(conn => (
            <ConnectionCard
              key={conn.id}
              conn={conn}
              multiple={connections.length > 1}
              onRemove={handleRemove}
              onMakePrimary={handleMakePrimary}
              onToggleCopy={handleToggleCopy}
            />
          ))}
        </div>
      )}

      {/* Success flash */}
      {success && (
        <div className="flex items-center gap-2 text-xs text-profit px-1">
          <CheckCircle size={12} />
          Account added — deploying (this takes ~30 seconds).
        </div>
      )}

      {/* Add form or button */}
      {adding ? (
        <div className="card px-4">
          <AddBrokerForm
            onAdded={handleAdded}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 text-sm text-primary hover:opacity-80"
        >
          <Plus size={14} />
          Add broker account
        </button>
      )}

      {connections.length === 0 && !adding && (
        <p className="text-xs text-text-muted">
          No broker accounts connected. Add an MT5 or MT4 account to start copying signals.
        </p>
      )}
    </div>
  );
}
