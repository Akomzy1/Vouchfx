"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2, PauseCircle, PlayCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserHealthRow {
  user_id: string;
  email: string;
  joined_at: string;
  tg_status: string;
  tg_last_connected: string | null;
  broker_active: boolean;
  broker_last_synced: string | null;
  last_trade_at: string | null;
  errors_24h: number;
}

export interface WorkerHealthRow {
  worker_id: string;
  worker_type: string;
  last_seen_at: string;
  stale_ms: number;
  healthy: boolean;
}

export interface CalendarFeedRow {
  source: string;
  last_success_at: string | null;
  last_attempt_at: string | null;
  last_status: string | null;
  last_error: string | null;
}

export interface CalendarHealth {
  feeds: CalendarFeedRow[];
  newestEventFetchedAt: string | null;
  stale: boolean;
}

interface Props {
  users: UserHealthRow[];
  workers: WorkerHealthRow[];
  calendar?: CalendarHealth;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tsAgo(iso: string | null): string {
  if (!iso) return "—";
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)  return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function TgBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    active:       { cls: "bg-profit/10 text-profit border-profit/20",       label: "Active" },
    limited:      { cls: "bg-warning/10 text-warning border-warning/20",    label: "Limited" },
    banned:       { cls: "bg-loss/10 text-loss border-loss/20",             label: "Banned" },
    disconnected: { cls: "bg-border text-text-muted border-border",         label: "Disconnected" },
    none:         { cls: "bg-border text-text-muted border-border",         label: "None" },
  };
  const { cls, label } = map[status] ?? map["none"]!;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ─── AdminHealthClient ────────────────────────────────────────────────────────

export default function AdminHealthClient({ users, workers, calendar }: Props) {
  const router = useRouter();
  const [pausing, setPausing] = useState<Record<string, boolean>>({});

  async function togglePause(userId: string, currentlyPaused: boolean) {
    setPausing((p) => ({ ...p, [userId]: true }));
    try {
      await fetch(`/api/admin/users/${userId}/pause`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !currentlyPaused }),
      });
      router.refresh();
    } finally {
      setPausing((p) => ({ ...p, [userId]: false }));
    }
  }

  const allWorkersHealthy = workers.length > 0 && workers.every((w) => w.healthy);

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Ops health</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {users.length} user{users.length !== 1 ? "s" : ""} · last updated now
          </p>
        </div>
        <button
          onClick={() => router.refresh()}
          className="flex items-center gap-1.5 text-xs text-primary hover:opacity-80"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Worker heartbeats (VCH-ADM-02) */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-text-primary">Workers</h2>
        {workers.length === 0 ? (
          <div className="card p-4">
            <p className="text-sm text-text-muted">No worker heartbeats — workers may not be running.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
              {allWorkersHealthy ? (
                <CheckCircle2 size={14} className="text-profit" />
              ) : (
                <AlertTriangle size={14} className="text-warning" />
              )}
              <span className="text-xs font-medium text-text-secondary">
                {allWorkersHealthy ? "All workers healthy" : "One or more workers stale"}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Worker ID", "Type", "Last seen", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => (
                  <tr key={w.worker_id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-text-muted">{w.worker_id}</td>
                    <td className="px-4 py-2.5 text-xs text-text-secondary capitalize">{w.worker_type}</td>
                    <td className="px-4 py-2.5 text-xs text-text-muted">{tsAgo(w.last_seen_at)}</td>
                    <td className="px-4 py-2.5">
                      {w.healthy ? (
                        <span className="flex items-center gap-1 text-xs text-profit">
                          <CheckCircle2 size={12} /> Healthy
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-loss">
                          <XCircle size={12} /> Stale ({Math.round(w.stale_ms / 1000)}s)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Calendar feed health (VCH-RSK-06b) */}
      {calendar && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text-primary">Economic calendar</h2>
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
              {calendar.stale ? (
                <AlertTriangle size={14} className="text-warning" />
              ) : (
                <CheckCircle2 size={14} className="text-profit" />
              )}
              <span className="text-xs font-medium text-text-secondary">
                {calendar.stale
                  ? "Cache stale (>48h) — fail-safe news blocks active for prop accounts"
                  : `Cache fresh — newest events fetched ${tsAgo(calendar.newestEventFetchedAt)}`}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Source", "Last success", "Last attempt", "Last status"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calendar.feeds.map((f) => (
                  <tr key={f.source} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-text-primary">{f.source}</td>
                    <td className="px-4 py-2.5 text-xs text-text-muted">{tsAgo(f.last_success_at)}</td>
                    <td className="px-4 py-2.5 text-xs text-text-muted">{tsAgo(f.last_attempt_at)}</td>
                    <td className="px-4 py-2.5">
                      {f.last_status === "success" ? (
                        <span className="flex items-center gap-1 text-xs text-profit">
                          <CheckCircle2 size={12} /> success
                        </span>
                      ) : f.last_status ? (
                        <span className="flex items-center gap-1 text-xs text-warning" title={f.last_error ?? undefined}>
                          <AlertTriangle size={12} /> {f.last_status}
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted">never fetched</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Per-user health (VCH-ADM-01) */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-text-primary">Users</h2>
        {users.length === 0 ? (
          <div className="card p-4">
            <p className="text-sm text-text-muted">No users yet.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Email", "TG status", "TG last seen", "Broker", "Last trade", "Errors (24h)", ""].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isPaused = u.tg_status === "disconnected";
                    const isBusy = pausing[u.user_id] ?? false;
                    const hasTg = u.tg_status !== "none";
                    return (
                      <tr key={u.user_id} className="border-b border-border last:border-0 hover:bg-surface-elevated/40 transition-colors">
                        <td className="px-4 py-2.5 text-sm text-text-primary max-w-[200px] truncate">
                          {u.email}
                        </td>
                        <td className="px-4 py-2.5">
                          <TgBadge status={u.tg_status} />
                        </td>
                        <td className="px-4 py-2.5 text-xs text-text-muted whitespace-nowrap">
                          {tsAgo(u.tg_last_connected)}
                        </td>
                        <td className="px-4 py-2.5">
                          {u.broker_active ? (
                            <span className="flex items-center gap-1 text-xs text-profit">
                              <CheckCircle2 size={12} /> Active
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-text-muted">
                              <XCircle size={12} /> None
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-text-muted whitespace-nowrap">
                          {tsAgo(u.last_trade_at)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`num text-xs font-medium tabular-nums ${u.errors_24h > 0 ? "text-loss" : "text-text-muted"}`}>
                            {u.errors_24h}
                          </span>
                        </td>
                        {/* Pause / resume (VCH-ADM-04) */}
                        <td className="px-4 py-2.5">
                          {hasTg && (
                            <button
                              onClick={() => togglePause(u.user_id, isPaused)}
                              disabled={isBusy}
                              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary disabled:opacity-50 transition-colors whitespace-nowrap"
                              title={isPaused ? "Resume listener" : "Pause listener"}
                            >
                              {isBusy ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : isPaused ? (
                                <PlayCircle size={12} />
                              ) : (
                                <PauseCircle size={12} />
                              )}
                              {isPaused ? "Resume" : "Pause"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
