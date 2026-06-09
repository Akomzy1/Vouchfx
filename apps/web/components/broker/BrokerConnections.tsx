"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2, AlertCircle, CheckCircle, Server } from "lucide-react";
import StatusPill from "@/components/ui/StatusPill";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrokerConnectionRow {
  id: string;
  label: string | null;
  platform: string;
  is_active: boolean;
  status: "deploying" | "connected" | "disconnected" | "error";
  server_hint: string | null;
  last_status_at: string | null;
  created_at: string;
}

interface BrokerConnectionsProps {
  initialConnections: BrokerConnectionRow[];
}

// ─── Connection card ──────────────────────────────────────────────────────────

function ConnectionCard({
  conn,
  onRemove,
}: {
  conn: BrokerConnectionRow;
  onRemove: (id: string) => void;
}) {
  const [status, setStatus] = useState(conn.status);
  const [removing, setRemoving] = useState(false);

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
          <p className="text-sm font-medium text-text-primary truncate">
            {conn.label ?? `${conn.platform} Account`}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <StatusPill status={pillStatus} label={statusLabel} />
            {conn.server_hint && (
              <span className="text-xs text-text-muted truncate">{conn.server_hint}</span>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={handleRemove}
        disabled={removing}
        className="ml-3 text-text-muted hover:text-loss disabled:opacity-40 transition-colors"
        aria-label={`Remove ${conn.label ?? "broker account"}`}
      >
        {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
      </button>
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
    setConnections(prev => prev.filter(c => c.id !== id));
  }, []);

  return (
    <div className="space-y-3">
      {/* Connected accounts list */}
      {connections.length > 0 && !adding && (
        <div className="card px-4 py-0">
          {connections.map(conn => (
            <ConnectionCard key={conn.id} conn={conn} onRemove={handleRemove} />
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
