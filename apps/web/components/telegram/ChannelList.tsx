"use client";

import { useState, useCallback, useRef } from "react";
import {
  Radio, RefreshCw, Loader2, AlertCircle, Hash, Megaphone,
  FlaskConical, ArrowUpCircle, ChevronDown, ChevronUp,
  Zap, TrendingDown, Pause,
} from "lucide-react";
import type { TelegramDialog } from "@/app/api/telegram/channels/route";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChannelSource {
  id: string;
  telegram_chat_id: string;
  title: string | null;
  is_enabled: boolean;
  daily_signal_limit: number | null;
  demo_until: string | null;
  override_risk_enabled: boolean;
  override_risk_pct: number | null;
  signals_today: number;
}

interface ChannelListProps {
  initialSources: ChannelSource[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDemo(source: ChannelSource): boolean {
  return !!source.demo_until && new Date(source.demo_until) > new Date();
}

function demoDaysLeft(demoUntil: string): number {
  return Math.max(0, Math.ceil((new Date(demoUntil).getTime() - Date.now()) / 86_400_000));
}

function formatMembers(count: number | null): string {
  if (count === null) return "";
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k members`;
  return `${count} members`;
}

// ─── SummaryStrip ─────────────────────────────────────────────────────────────

function SummaryStrip({ sources }: { sources: ChannelSource[] }) {
  const live    = sources.filter(s => s.is_enabled && !isDemo(s)).length;
  const demo    = sources.filter(s => s.is_enabled && isDemo(s)).length;
  const paused  = sources.filter(s => !s.is_enabled).length;
  const signals = sources.reduce((a, s) => a + s.signals_today, 0);

  const items = [
    { label: "Total",         value: sources.length, cls: "text-text-primary" },
    { label: "Live",          value: live,           cls: "text-profit" },
    { label: "Demo",          value: demo,           cls: "text-warning" },
    { label: "Paused",        value: paused,         cls: "text-text-muted" },
    { label: "Signals today", value: signals,        cls: "text-primary" },
  ] as const;

  return (
    <div className="grid grid-cols-5 overflow-hidden rounded-xl border border-border bg-surface">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={`flex flex-col items-center gap-0.5 py-3 ${i < items.length - 1 ? "border-r border-border/60" : ""}`}
        >
          <span className={`num text-lg font-bold leading-none ${item.cls}`}>{item.value}</span>
          <span className="mt-0.5 text-center text-[10px] leading-tight text-text-muted">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── SignalMeter ──────────────────────────────────────────────────────────────

function SignalMeter({ used, limit }: { used: number; limit: number }) {
  const full = used >= limit;
  const dots = Math.min(limit, 8);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: dots }).map((_, i) => (
          <span
            key={i}
            className={`h-3 w-1 rounded-full ${
              i < used ? (full ? "bg-warning" : "bg-primary") : "bg-border"
            }`}
          />
        ))}
        {limit > 8 && <span className="text-[10px] text-text-muted">…</span>}
      </div>
      <span className={`num text-[11px] tabular-nums ${full ? "text-warning" : "text-text-muted"}`}>
        {used}/{limit}
      </span>
    </div>
  );
}

// ─── OverridePanel ────────────────────────────────────────────────────────────

function OverridePanel({
  source,
  onSave,
}: {
  source: ChannelSource;
  onSave: (id: string, updates: Partial<ChannelSource>) => void;
}) {
  const [riskEnabled, setRiskEnabled] = useState(source.override_risk_enabled);
  const [riskPct, setRiskPct] = useState<number>(source.override_risk_pct ?? 0.5);
  const [saving, setSaving] = useState(false);
  const dirty =
    riskEnabled !== source.override_risk_enabled ||
    (riskEnabled && riskPct !== (source.override_risk_pct ?? 0.5));

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/channels/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          override_risk_enabled: riskEnabled,
          override_risk_pct: riskEnabled ? riskPct : null,
        }),
      });
      if (res.ok) {
        onSave(source.id, {
          override_risk_enabled: riskEnabled,
          override_risk_pct: riskEnabled ? riskPct : null,
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-border/50 bg-surface-elevated/30 px-4 py-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">Risk override</p>
          <p className="text-xs text-text-muted mt-0.5">
            Override global risk % for this channel only.
          </p>
        </div>
        {/* Toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={riskEnabled}
          onClick={() => setRiskEnabled(!riskEnabled)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            riskEnabled ? "bg-primary" : "bg-border"
          }`}
        >
          <span className="sr-only">Risk override</span>
          <span
            className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              riskEnabled ? "translate-x-[18px]" : "translate-x-[2px]"
            }`}
          />
        </button>
      </div>

      {riskEnabled && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0.1}
              max={3}
              step={0.1}
              value={riskPct}
              onChange={(e) => setRiskPct(Number(e.target.value))}
              className="flex-1 h-1.5 cursor-pointer rounded-full accent-primary"
            />
            <span className="num w-12 text-right text-sm font-semibold text-text-primary tabular-nums">
              {riskPct.toFixed(1)}%
            </span>
          </div>
          <p className="text-xs text-text-muted">
            Applies instead of the global risk % for every signal from this channel.
          </p>
        </div>
      )}

      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-[#04201D] hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving && <Loader2 size={11} className="animate-spin" />}
          Save override
        </button>
      )}
    </div>
  );
}

// ─── KillModal ────────────────────────────────────────────────────────────────

type KillAction = "keep" | "close_all";

function KillModal({
  title,
  onClose,
  onConfirm,
  confirming,
}: {
  title: string;
  onClose: () => void;
  onConfirm: (action: KillAction) => void;
  confirming: boolean;
}) {
  const [choice, setChoice] = useState<KillAction>("keep");

  const options: { value: KillAction; label: string; sub: string; Icon: typeof Pause }[] = [
    {
      value: "keep",
      label: "Pause & keep trades open",
      sub: "Stop copying new signals. Your open positions continue under their existing SL/TP — manage them from the Dashboard.",
      Icon: Pause,
    },
    {
      value: "close_all",
      label: "Pause & close all positions",
      sub: "Stop copying AND immediately close every open and pending position from this channel.",
      Icon: TrendingDown,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface-elevated p-6 shadow-2xl">
        <div className="flex items-center gap-2 mb-1">
          <Zap size={16} className="text-warning" />
          <h3 className="text-[15px] font-bold text-text-primary">
            Kill switch — {title}
          </h3>
        </div>
        <p className="text-sm text-text-muted mb-4">
          Choose what happens to your open positions when this channel is paused.
        </p>

        <div className="space-y-2">
          {options.map(({ value, label, sub, Icon }) => (
            <label
              key={value}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors ${
                choice === value
                  ? "border-primary/40 bg-primary/[0.05]"
                  : "border-border hover:border-border/80 bg-surface/50"
              }`}
            >
              <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border transition-colors">
                {choice === value && (
                  <div className="h-2 w-2 rounded-full bg-primary" />
                )}
                <input
                  type="radio"
                  className="sr-only"
                  checked={choice === value}
                  onChange={() => setChoice(value)}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Icon size={13} className={value === "close_all" ? "text-loss" : "text-warning"} />
                  <p className="text-sm font-medium text-text-primary">{label}</p>
                </div>
                <p className="mt-0.5 text-xs text-text-muted leading-relaxed">{sub}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-elevated disabled:opacity-50"
            disabled={confirming}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(choice)}
            disabled={confirming}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-all disabled:opacity-60 ${
              choice === "close_all"
                ? "bg-loss/90 text-white hover:bg-loss"
                : "bg-primary text-[#04201D] hover:opacity-90"
            }`}
          >
            {confirming && <Loader2 size={13} className="animate-spin" />}
            {choice === "close_all" ? "Pause & close all" : "Pause channel"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LimitEditor — inline editable daily limit ───────────────────────────────

function LimitEditor({
  sourceId,
  current,
  onUpdate,
}: {
  sourceId: string;
  current: number | null;
  onUpdate: (id: string, limit: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(current ?? ""));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setValue(String(current ?? ""));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commit() {
    const limit = value.trim() === "" || value === "0" ? null : parseInt(value, 10);
    if (limit !== null && (isNaN(limit) || limit < 1)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/channels/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daily_signal_limit: limit }),
      });
      if (res.ok) onUpdate(sourceId, limit);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (saving) return <Loader2 size={12} className="animate-spin text-text-muted" />;

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="num w-16 rounded border border-primary bg-surface-elevated px-1.5 py-0.5 text-xs text-text-primary tabular-nums focus:outline-none"
          placeholder="0 = ∞"
          autoFocus
        />
        <button
          onClick={() => setEditing(false)}
          className="text-text-muted hover:text-text-secondary text-xs"
          aria-label="Cancel"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="text-xs text-text-muted hover:text-text-secondary transition-colors"
      title="Set per-channel signal limit"
    >
      {current ? `${current}/day` : "no limit"}
    </button>
  );
}

// ─── PromoteButton ────────────────────────────────────────────────────────────

function PromoteButton({
  sourceId,
  onPromote,
}: {
  sourceId: string;
  onPromote: (id: string) => void;
}) {
  const [promoting, setPromoting] = useState(false);

  async function handlePromote() {
    setPromoting(true);
    try {
      const res = await fetch(`/api/channels/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promote_to_live: true }),
      });
      if (res.ok) onPromote(sourceId);
    } finally {
      setPromoting(false);
    }
  }

  return (
    <button
      onClick={handlePromote}
      disabled={promoting}
      className="flex items-center gap-1 text-xs text-primary hover:opacity-80 disabled:opacity-50 transition-opacity"
      title="Switch this channel to live trading"
    >
      {promoting
        ? <Loader2 size={11} className="animate-spin" />
        : <ArrowUpCircle size={11} />
      }
      <span>Go live</span>
    </button>
  );
}

// ─── ChannelRow ───────────────────────────────────────────────────────────────

function ChannelRow({
  chatId,
  title,
  isChannel,
  isMegagroup,
  participantsCount,
  source,
  expanded,
  onToggleExpand,
  onRequestKill,
  onLimitUpdate,
  onPromote,
  onOverrideSave,
}: TelegramDialog & {
  source: ChannelSource | undefined;
  expanded: boolean;
  onToggleExpand: (chatId: string) => void;
  onRequestKill: (source: ChannelSource, title: string) => void;
  onLimitUpdate: (id: string, limit: number | null) => void;
  onPromote: (id: string) => void;
  onOverrideSave: (id: string, updates: Partial<ChannelSource>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const enabled = source?.is_enabled ?? false;
  const demo = source ? isDemo(source) : false;
  const daysLeft = demo && source?.demo_until ? demoDaysLeft(source.demo_until) : 0;

  // Toggling ON = add channel (POST /api/channels)
  // Toggling OFF = show KillModal (handled by parent)
  async function handleToggleOn() {
    if (!source) {
      setBusy(true);
      try {
        const res = await fetch("/api/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telegram_chat_id: chatId, title }),
        });
        const json = await res.json();
        if (res.ok) {
          // Parent will refresh local state via onToggleExpand context — but we
          // need a real add callback. Re-use onLimitUpdate channel to signal a
          // full-add by passing the new source back through a no-op approach.
          // Simpler: reload the page or let the parent handle it.
          // For now, we rely on the parent's discover flow to refresh.
          window.location.reload();
        } else {
          console.error("Failed to add channel:", json.error);
        }
      } finally {
        setBusy(false);
      }
    }
  }

  function handleToggle() {
    if (source && enabled) {
      // Disabling — show KillModal
      onRequestKill(source, title);
    } else if (!source) {
      handleToggleOn();
    }
  }

  const canExpand = !!source;

  return (
    <div className="border-b border-border last:border-0">
      {/* Main row */}
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Icon */}
        <div className="mt-0.5 shrink-0">
          {isChannel && !isMegagroup
            ? <Megaphone size={14} className="text-text-muted" />
            : <Hash size={14} className="text-text-muted" />
          }
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-text-primary truncate">{title}</p>
            {demo && (
              <span className="inline-flex items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                <FlaskConical size={10} />
                Demo · {daysLeft}d
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <p className="text-xs text-text-muted">
              {isChannel && !isMegagroup ? "Channel" : isMegagroup ? "Supergroup" : "Group"}
              {participantsCount !== null && ` · ${formatMembers(participantsCount)}`}
            </p>
            {source && (
              <LimitEditor
                sourceId={source.id}
                current={source.daily_signal_limit}
                onUpdate={onLimitUpdate}
              />
            )}
            {source && source.daily_signal_limit !== null && source.daily_signal_limit > 0 && (
              <SignalMeter
                used={source.signals_today}
                limit={source.daily_signal_limit}
              />
            )}
            {demo && source && (
              <PromoteButton sourceId={source.id} onPromote={onPromote} />
            )}
          </div>
        </div>

        {/* Right: expand chevron + toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {canExpand && (
            <button
              onClick={() => onToggleExpand(chatId)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-secondary"
              aria-label={expanded ? "Collapse settings" : "Expand settings"}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          <button
            onClick={handleToggle}
            disabled={busy}
            aria-label={enabled ? `Disable ${title}` : `Enable ${title}`}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${
              enabled ? "bg-primary" : "bg-border"
            }`}
          >
            {busy ? (
              <Loader2 size={10} className="absolute inset-0 m-auto animate-spin text-white" />
            ) : (
              <span
                className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                  enabled ? "translate-x-[18px]" : "translate-x-[2px]"
                }`}
              />
            )}
          </button>
        </div>
      </div>

      {/* Override panel (expand on chevron click) */}
      {canExpand && expanded && source && (
        <OverridePanel source={source} onSave={onOverrideSave} />
      )}
    </div>
  );
}

// ─── ChannelList ─────────────────────────────────────────────────────────────

export default function ChannelList({ initialSources }: ChannelListProps) {
  const [sources, setSources]       = useState<ChannelSource[]>(initialSources);
  const [dialogs, setDialogs]       = useState<TelegramDialog[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [killTarget, setKillTarget] = useState<{ source: ChannelSource; title: string } | null>(null);
  const [killing, setKilling]       = useState(false);

  const sourceMap = new Map(sources.map(s => [String(s.telegram_chat_id), s]));

  async function discover() {
    setDiscovering(true);
    setDiscoverError(null);
    try {
      const res = await fetch("/api/telegram/channels");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load channels");
      setDialogs(json.channels as TelegramDialog[]);
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscovering(false);
    }
  }

  const handleToggleExpand = useCallback((chatId: string) => {
    setExpandedId(prev => prev === chatId ? null : chatId);
  }, []);

  const handleRequestKill = useCallback((source: ChannelSource, title: string) => {
    setKillTarget({ source, title });
  }, []);

  const handleKillConfirm = useCallback(async (action: KillAction) => {
    if (!killTarget) return;
    setKilling(true);
    try {
      if (action === "keep") {
        // Hard-delete: just remove the source row
        const res = await fetch(`/api/channels/${killTarget.source.id}`, { method: "DELETE" });
        if (res.ok || res.status === 204) {
          setSources(prev => prev.filter(s => s.id !== killTarget.source.id));
        }
      } else {
        // Kill-close: soft-disable + set flag for executor to close all trades
        const res = await fetch(`/api/channels/${killTarget.source.id}`, { method: "POST" });
        if (res.ok) {
          // Optimistically remove from UI — executor handles the actual close
          setSources(prev => prev.filter(s => s.id !== killTarget.source.id));
        }
      }
    } finally {
      setKilling(false);
      setKillTarget(null);
    }
  }, [killTarget]);

  const handleLimitUpdate = useCallback((id: string, limit: number | null) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, daily_signal_limit: limit } : s));
  }, []);

  const handlePromote = useCallback((id: string) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, demo_until: null } : s));
  }, []);

  const handleOverrideSave = useCallback((id: string, updates: Partial<ChannelSource>) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const rows: (TelegramDialog & { source: ChannelSource | undefined })[] = dialogs
    ? dialogs.map(d => ({ ...d, source: sourceMap.get(d.chatId) }))
    : sources.map(s => ({
        chatId:            String(s.telegram_chat_id),
        title:             s.title ?? `Chat ${s.telegram_chat_id}`,
        isChannel:         false,
        isMegagroup:       false,
        participantsCount: null,
        source:            s,
      }));

  return (
    <div className="space-y-4">
      {/* Summary strip — only when we have sources */}
      {sources.length > 0 && <SummaryStrip sources={sources} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">Signal channels</p>
          <p className="text-xs text-text-secondary">
            {sources.filter(s => s.is_enabled).length === 0
              ? "No channels enabled — discover and toggle to start copying."
              : `${sources.filter(s => s.is_enabled).length} channel${sources.filter(s => s.is_enabled).length !== 1 ? "s" : ""} enabled`
            }
          </p>
        </div>
        <button
          onClick={discover}
          disabled={discovering}
          className="flex items-center gap-1.5 text-xs text-primary hover:opacity-80 disabled:opacity-50"
        >
          {discovering
            ? <Loader2 size={12} className="animate-spin" />
            : <RefreshCw size={12} />
          }
          {dialogs ? "Refresh" : "Discover channels"}
        </button>
      </div>

      {discoverError && (
        <div className="flex items-start gap-2 rounded-lg border border-loss/30 bg-red-900/20 px-3 py-2 text-xs text-loss">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{discoverError}</span>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {rows.map(row => (
            <ChannelRow
              key={row.chatId}
              {...row}
              expanded={expandedId === row.chatId}
              onToggleExpand={handleToggleExpand}
              onRequestKill={handleRequestKill}
              onLimitUpdate={handleLimitUpdate}
              onPromote={handlePromote}
              onOverrideSave={handleOverrideSave}
            />
          ))}
        </div>
      ) : !discovering && (
        <div className="card p-8 text-center space-y-2">
          <Radio size={24} className="mx-auto text-text-muted" />
          <p className="text-sm text-text-muted">No channels yet.</p>
          <p className="text-xs text-text-muted">
            Click <strong className="text-text-secondary">Discover channels</strong> to load all
            Telegram channels and groups you belong to.
          </p>
        </div>
      )}

      {discovering && rows.length === 0 && (
        <div className="card p-8 flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin text-primary" />
          <p className="text-xs text-text-secondary">
            Connecting to Telegram to load your channels…
          </p>
        </div>
      )}

      {/* Kill-switch modal */}
      {killTarget && (
        <KillModal
          title={killTarget.title}
          onClose={() => setKillTarget(null)}
          onConfirm={handleKillConfirm}
          confirming={killing}
        />
      )}
    </div>
  );
}
