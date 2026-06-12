"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Send, Plus, X, Check, Users, Server, Search, Loader2,
  CircleCheck, PauseCircle, OctagonX, XCircle,
  SlidersHorizontal, ChevronDown, Gauge, ListFilter,
  Minus, Zap, ShieldCheck, ShieldHalf, Repeat2, TriangleAlert,
} from "lucide-react";
import type { TelegramDialog } from "@/app/api/telegram/channels/route";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

export type ChannelSlPolicy = "require" | "apply_default" | null;

export interface ChannelSource {
  id: string;
  telegram_chat_id: string;
  title: string | null;
  is_enabled: boolean;
  daily_signal_limit: number | null;
  override_risk_enabled: boolean;
  override_risk_pct: number | null;
  /** Per-channel no-SL policy: null = use global. */
  sl_policy: ChannelSlPolicy;
  /** Flip BUY/SELL for this channel. */
  reverse_trades: boolean;
  signals_today: number;
}

interface ChannelListProps {
  initialSources: ChannelSource[];
  globalRiskPct: number;
  globalDailyLimit: number; // 0 = no global limit
  brokerLabel: string | null;
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function statusOf(s: ChannelSource): { label: string; icon: React.ElementType; cls: string; live: boolean } {
  if (!s.is_enabled) return { label: "Paused", icon: PauseCircle, cls: "border-warning/30 bg-warning/10 text-warning", live: false };
  return { label: "Live", icon: CircleCheck, cls: "border-profit/30 bg-profit/10 text-profit", live: true };
}

function titleOf(s: ChannelSource): string {
  return s.title ?? `Chat ${s.telegram_chat_id}`;
}

/* ─── Primitives ────────────────────────────────────────────────────────────── */

function Toggle({
  on, onChange, disabled, label, size = "base",
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  size?: "sm" | "base";
}) {
  const d = size === "sm"
    ? { w: "w-9", h: "h-5", k: "h-3.5 w-3.5", on: "translate-x-[18px]", off: "translate-x-[3px]" }
    : { w: "w-11", h: "h-6", k: "h-[18px] w-[18px]", on: "translate-x-[22px]", off: "translate-x-[3px]" };
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!on)}
      className={`relative inline-flex ${d.w} ${d.h} shrink-0 items-center rounded-full border transition-colors duration-200 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      } ${on ? "border-primary bg-primary" : "border-border bg-surface-elevated"}`}
    >
      <span
        className={`pointer-events-none inline-block ${d.k} transform rounded-full transition-transform duration-200 ${
          on ? `${d.on} bg-[#04201D]` : `${d.off} bg-text-secondary`
        }`}
      />
    </button>
  );
}

function SignalMeter({ used, limit }: { used: number; limit: number }) {
  const full = used >= limit;
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: Math.min(limit, 8) }).map((_, i) => (
          <span key={i} className={`h-3.5 w-1.5 rounded-full ${i < used ? (full ? "bg-warning" : "bg-primary") : "bg-surface-elevated"}`} />
        ))}
      </div>
      <span className={`num text-[12px] font-semibold ${full ? "text-warning" : "text-text-secondary"}`}>
        {used} of {limit}
      </span>
    </div>
  );
}

function InlineSetting({ icon: Icon, label, value, custom }: { icon: React.ElementType; label: string; value: string; custom: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-bg/40 px-2.5 py-1.5">
      <Icon size={13} className="text-text-muted" />
      {label && <span className="text-[11px] text-text-muted">{label}</span>}
      <span className={`num ml-0.5 text-[12px] font-semibold ${custom ? "text-primary-light" : "text-text-secondary"}`}>{value}</span>
    </div>
  );
}

function Stepper({ value, min, max, onChange, disabled }: { value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean }) {
  const btn = "flex h-8 w-8 items-center justify-center text-text-secondary transition-colors hover:text-text-primary disabled:opacity-30";
  return (
    <div className={`inline-flex items-center rounded-lg border border-border bg-bg/50 ${disabled ? "opacity-50" : ""}`}>
      <button className={btn} disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label="Decrease">
        <Minus size={15} />
      </button>
      <span className="num w-10 text-center text-[14px] font-bold text-text-primary">{value}</span>
      <button className={btn} disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label="Increase">
        <Plus size={15} />
      </button>
    </div>
  );
}

/* ─── Modal shell ───────────────────────────────────────────────────────────── */

function ModalShell({ children, onClose, max = "max-w-md" }: { children: React.ReactNode; onClose: () => void; max?: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="anim-overlay absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div className={`anim-sheet relative z-10 w-full ${max} rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl`}>
        {children}
      </div>
    </div>
  );
}

/* ─── Kill switch modal ─────────────────────────────────────────────────────── */

type KillAction = "keep" | "close";

function KillModal({ title, busy, onClose, onConfirm }: { title: string; busy: boolean; onClose: () => void; onConfirm: (a: KillAction) => void }) {
  const [choice, setChoice] = useState<KillAction>("keep");
  const options: [KillAction, string, string, React.ElementType, "warn" | "loss"][] = [
    ["keep", "Pause & keep trades open", "Stop copying new signals. Open positions keep running under their existing SL/TP — manage them manually.", PauseCircle, "warn"],
    ["close", "Pause & close all", "Stop copying AND immediately close all open positions from this channel at market. Locks in current P&L.", XCircle, "loss"],
  ];
  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-start gap-3 border-b border-border p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-loss/30 bg-loss/10 text-loss">
          <OctagonX size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-bold tracking-tight text-text-primary">Kill switch — {title}</h2>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-secondary">
            Choose how to handle this channel&rsquo;s open trades when you pause it.
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-text-muted transition-colors hover:text-text-primary" aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="flex flex-col gap-2.5 p-5">
        {options.map(([key, label, desc, Icon, tone]) => {
          const on = choice === key;
          const ring = on
            ? tone === "loss" ? "border-loss/50 bg-loss/[0.07]" : "border-warning/50 bg-warning/[0.07]"
            : "border-border bg-bg/40 hover:border-text-muted";
          return (
            <button key={key} onClick={() => setChoice(key)} className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${ring}`}>
              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${on ? (tone === "loss" ? "border-loss" : "border-warning") : "border-text-muted"}`}>
                {on && <span className={`h-2 w-2 rounded-full ${tone === "loss" ? "bg-loss" : "bg-warning"}`} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <Icon size={14} className={tone === "loss" ? "text-loss" : "text-warning"} />
                  <span className="text-[13.5px] font-semibold text-text-primary">{label}</span>
                </span>
                <span className="mt-1 block text-[12px] leading-relaxed text-text-secondary">{desc}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2.5 border-t border-border p-4">
        <button onClick={onClose} className="flex-1 rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary">
          Cancel
        </button>
        <button
          onClick={() => onConfirm(choice)}
          disabled={busy}
          className={`inline-flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all hover:brightness-110 active:translate-y-px disabled:opacity-50 ${
            choice === "close" ? "bg-loss text-white" : "bg-warning text-[#3A2200]"
          }`}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : choice === "close" ? <XCircle size={16} /> : <PauseCircle size={16} />}
          {choice === "close" ? "Pause & close all" : "Pause & keep open"}
        </button>
      </div>
    </ModalShell>
  );
}

/* ─── Add channel modal (discovers from the user's Telegram) ───────────────── */

function AddModal({
  existingChatIds, onClose, onAdded,
}: {
  existingChatIds: Set<string>;
  onClose: () => void;
  onAdded: (s: ChannelSource) => void;
}) {
  const [dialogs, setDialogs] = useState<TelegramDialog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/telegram/channels")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error as string);
        else setDialogs((d.channels ?? []) as TelegramDialog[]);
      })
      .catch(() => setError("Failed to load your Telegram channels."));
  }, []);

  async function add(d: TelegramDialog) {
    setAddingId(d.chatId);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_chat_id: d.chatId, title: d.title }),
      });
      const json = await res.json();
      if (res.ok && json.source) {
        const s = json.source as Omit<ChannelSource, "override_risk_enabled" | "override_risk_pct" | "sl_policy" | "reverse_trades" | "signals_today">;
        onAdded({
          ...s,
          telegram_chat_id: String(s.telegram_chat_id),
          override_risk_enabled: false,
          override_risk_pct: null,
          sl_policy: null,
          reverse_trades: false,
          signals_today: 0,
        });
      } else {
        setError((json.error as string) ?? "Failed to add channel");
      }
    } finally {
      setAddingId(null);
    }
  }

  const list = (dialogs ?? []).filter(
    (d) => !existingChatIds.has(d.chatId) && d.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <ModalShell onClose={onClose} max="max-w-lg">
      <div className="flex items-center gap-3 border-b border-border p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary-light">
          <Plus size={20} strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-bold tracking-tight text-text-primary">Add a channel</h2>
          <p className="mt-0.5 text-[12.5px] text-text-secondary">
            Pick a channel you follow — VouchFX will start listening.
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-text-muted transition-colors hover:text-text-primary" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-bg/50 px-3 focus-within:border-primary/50">
          <Search size={16} className="text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            placeholder="Search your channels…"
            className="num w-full bg-transparent py-2.5 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-loss/30 bg-loss/[0.07] px-3.5 py-2.5 text-[12px] text-loss">{error}</div>
        )}

        {dialogs === null && !error ? (
          <div className="flex items-center justify-center gap-2 py-10 text-text-muted">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-[13px]">Loading your Telegram channels…</span>
          </div>
        ) : (
          <div className="scroll-thin max-h-[320px] overflow-y-auto rounded-xl border border-border">
            {list.length === 0 && dialogs !== null ? (
              <div className="px-4 py-8 text-center text-[13px] text-text-muted">
                {query ? "No channels match your search." : "No new channels found — you've added them all."}
              </div>
            ) : (
              list.map((d) => (
                <button
                  key={d.chatId}
                  onClick={() => add(d)}
                  disabled={addingId !== null}
                  className="flex w-full items-center gap-3 border-b border-border/60 px-3.5 py-3 text-left transition-colors last:border-0 hover:bg-surface-elevated/50 disabled:opacity-60"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-[15px] font-bold text-primary-light">
                    {d.title.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-text-primary">{d.title}</span>
                    <span className="num mt-0.5 flex items-center gap-2 text-[11px] text-text-muted">
                      {d.isChannel && !d.isMegagroup ? "Channel" : "Group"}
                      {d.participantsCount != null && (
                        <span className="inline-flex items-center gap-1">
                          <Users size={10} /> {d.participantsCount.toLocaleString()}
                        </span>
                      )}
                    </span>
                  </span>
                  {addingId === d.chatId ? (
                    <Loader2 size={16} className="shrink-0 animate-spin text-primary" />
                  ) : (
                    <Plus size={16} className="shrink-0 text-text-muted" />
                  )}
                </button>
              ))
            )}
          </div>
        )}

        <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-text-muted">
          <ShieldCheck size={13} className="mt-0.5 shrink-0 text-primary-light" />
          Want to test first? Connect your broker&rsquo;s free demo account — VouchFX works identically on demo and live.
        </p>
      </div>
    </ModalShell>
  );
}

/* ─── Expanded override panel ──────────────────────────────────────────────── */

function OverridePanel({
  source, globalRiskPct, globalDailyLimit, brokerLabel, onPatch,
}: {
  source: ChannelSource;
  globalRiskPct: number;
  globalDailyLimit: number;
  brokerLabel: string | null;
  onPatch: (id: string, body: Record<string, unknown>, optimistic: Partial<ChannelSource>) => void;
}) {
  const riskActive = source.override_risk_enabled;
  const [riskVal, setRiskVal] = useState(source.override_risk_pct ?? globalRiskPct);
  const shownRisk = riskActive ? riskVal : globalRiskPct;
  const pct = ((shownRisk - 0.1) / (3 - 0.1)) * 100;

  const limitActive = source.daily_signal_limit != null;
  const limitVal = source.daily_signal_limit ?? (globalDailyLimit > 0 ? globalDailyLimit : 5);

  const commitRisk = () => {
    if (riskActive) onPatch(source.id, { override_risk_pct: riskVal }, { override_risk_pct: riskVal });
  };

  return (
    <div className="anim-expand border-t border-border bg-bg/30 px-4 py-5 sm:px-5">
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Risk override */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge size={15} className="text-primary-light" />
              <span className="text-[13px] font-semibold text-text-primary">Risk per trade</span>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-text-secondary">
              Override global
              <Toggle
                size="sm"
                on={riskActive}
                onChange={(v) =>
                  onPatch(
                    source.id,
                    { override_risk_enabled: v, override_risk_pct: v ? riskVal : null },
                    { override_risk_enabled: v, override_risk_pct: v ? riskVal : null }
                  )
                }
                label="Override risk"
              />
            </label>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className={`num text-[26px] font-bold leading-none ${riskActive ? "text-primary-light" : "text-text-muted"}`}>
              {shownRisk.toFixed(2)}%
            </span>
            <span className="text-[11px] text-text-muted">
              {riskActive ? "of equity per signal" : `using global · ${globalRiskPct}%`}
            </span>
          </div>
          <input
            type="range"
            min={0.1}
            max={3}
            step={0.05}
            value={shownRisk}
            disabled={!riskActive}
            onChange={(e) => setRiskVal(parseFloat(e.target.value))}
            onMouseUp={commitRisk}
            onTouchEnd={commitRisk}
            onKeyUp={commitRisk}
            className="vfx-range mt-3"
            style={{
              background: riskActive ? `linear-gradient(90deg,#14B8A6 ${pct}%,#222B36 ${pct}%)` : "#222B36",
              opacity: riskActive ? 1 : 0.5,
            }}
          />
          <div className="num mt-1.5 flex justify-between text-[10px] text-text-muted">
            <span>0.10%</span>
            <span>conservative · aggressive</span>
            <span>3.00%</span>
          </div>
        </div>

        {/* Daily signal limit */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListFilter size={15} className="text-primary-light" />
              <span className="text-[13px] font-semibold text-text-primary">Daily signal limit</span>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-text-secondary">
              Override global
              <Toggle
                size="sm"
                on={limitActive}
                onChange={(v) =>
                  onPatch(
                    source.id,
                    { daily_signal_limit: v ? limitVal : null },
                    { daily_signal_limit: v ? limitVal : null }
                  )
                }
                label="Override limit"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-text-muted">Max trades copied / day</div>
              <div className="num mt-0.5 text-[12px] text-text-secondary">
                {limitActive
                  ? `${source.signals_today} used so far today`
                  : globalDailyLimit > 0
                    ? `using global · ${globalDailyLimit}/day`
                    : "using global · unlimited"}
              </div>
            </div>
            <Stepper
              value={limitVal}
              min={1}
              max={20}
              disabled={!limitActive}
              onChange={(v) => onPatch(source.id, { daily_signal_limit: v }, { daily_signal_limit: v })}
            />
          </div>
          <div className="mt-3 rounded-lg border border-border/70 bg-bg/40 px-3 py-2 text-[11px] text-text-muted">
            Extra signals beyond the limit are logged but not traded.
          </div>
        </div>

        {/* Default stop-loss policy */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <ShieldHalf size={15} className="text-primary-light" />
            <span className="text-[13px] font-semibold text-text-primary">Default stop-loss policy</span>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {([
              [null, "Use global policy", "Inherit your default stop-loss policy from Risk settings"],
              ["require", "Require SL — skip if missing", "Never trade a signal from this channel with no stop loss"],
              ["apply_default", "Auto SL when missing", "Apply your default SL (pips set in Risk settings)"],
            ] as [ChannelSlPolicy, string, string][]).map(([key, label, desc]) => {
              const on = source.sl_policy === key;
              return (
                <button
                  key={String(key)}
                  onClick={() => onPatch(source.id, { sl_policy: key }, { sl_policy: key })}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    on ? "border-primary/40 bg-primary/[0.07]" : "border-border bg-bg/40 hover:border-text-muted"
                  }`}
                >
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-primary" : "border-text-muted"}`}>
                    {on && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[12.5px] font-medium ${on ? "text-text-primary" : "text-text-secondary"}`}>{label}</span>
                    <span className="mt-0.5 block text-[11px] text-text-muted">{desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Reverse trades + routed-to */}
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated text-text-secondary">
                  <Repeat2 size={16} />
                </span>
                <div>
                  <div className="text-[13px] font-semibold text-text-primary">Reverse trades</div>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
                    Flip every BUY to SELL and vice-versa. For fading a channel you think runs opposite.
                  </p>
                </div>
              </div>
              <Toggle
                on={source.reverse_trades}
                onChange={(v) => onPatch(source.id, { reverse_trades: v }, { reverse_trades: v })}
                label="Reverse trades"
              />
            </div>
            {source.reverse_trades && (
              <div className="num mt-3 flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/[0.07] px-2.5 py-1.5 text-[11px] text-warning">
                <TriangleAlert size={12} /> Reversing active — trades execute opposite to the signal, SL/TP swapped.
              </div>
            )}
          </div>
          <div className="flex flex-1 items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
            <span className="flex items-center gap-2 text-[12px] text-text-secondary">
              <Server size={14} className="text-text-muted" /> Routed to
              <span className="num font-semibold text-text-primary">{brokerLabel ?? "your broker"} — MT5</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Channel card ──────────────────────────────────────────────────────────── */

function ChannelCard({
  source, globalRiskPct, globalDailyLimit, brokerLabel, expanded,
  onToggleExpand, onToggleEnabled, onKill, onPatch,
}: {
  source: ChannelSource;
  globalRiskPct: number;
  globalDailyLimit: number;
  brokerLabel: string | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleEnabled: (v: boolean) => void;
  onKill: () => void;
  onPatch: (id: string, body: Record<string, unknown>, optimistic: Partial<ChannelSource>) => void;
}) {
  const st = statusOf(source);
  const StIcon = st.icon;
  const title = titleOf(source);
  const limit = source.daily_signal_limit ?? (globalDailyLimit > 0 ? globalDailyLimit : 0);
  const muted = !source.is_enabled;

  const avatarCls = muted
    ? "border-border bg-surface-elevated text-text-muted"
    : "border-primary/30 bg-primary/10 text-primary-light";

  return (
    <div className={`overflow-hidden rounded-2xl border bg-surface transition-colors ${expanded ? "border-primary/30" : "border-border"} ${muted ? "opacity-80" : ""}`}>
      {/* Header row */}
      <div className="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-center">
        {/* Identity */}
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <span className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-[17px] font-bold ${avatarCls}`}>
            {title.charAt(0).toUpperCase()}
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-surface-elevated text-primary-light">
              <Send size={10} />
            </span>
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[15px] font-bold tracking-tight text-text-primary">{title}</h3>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>
                <StIcon size={11} /> {st.label}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-text-muted">
              <span className="num">{source.telegram_chat_id}</span>
              {brokerLabel && (
                <span className="inline-flex items-center gap-1">
                  <Server size={11} /> {brokerLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Signals today */}
        <div className="flex shrink-0 items-center gap-2 md:flex-col md:items-end md:gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted md:order-1">Signals today</span>
          <div className="md:order-2">
            {limit > 0 ? (
              <SignalMeter used={source.signals_today} limit={limit} />
            ) : (
              <span className="num text-[12px] font-semibold text-text-secondary">{source.signals_today} today</span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex shrink-0 items-center gap-2 border-t border-border/60 pt-3 md:gap-3 md:border-0 md:border-l md:border-border/60 md:pl-4 md:pt-0">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg">
            <span className="text-[11px] font-medium text-text-secondary">{source.is_enabled ? "Copying" : "Off"}</span>
            <Toggle on={source.is_enabled} onChange={onToggleEnabled} label="Copying enabled" />
          </label>
          <button
            onClick={onKill}
            title="Kill switch — pause channel"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-loss/30 bg-loss/[0.07] text-loss transition-colors hover:bg-loss/15"
          >
            <OctagonX size={17} />
          </button>
          <button
            onClick={onToggleExpand}
            title={expanded ? "Collapse" : "Settings"}
            className={`flex h-9 items-center gap-1 rounded-lg border px-2.5 text-[12px] font-medium transition-colors ${
              expanded
                ? "border-primary/30 bg-primary/10 text-primary-light"
                : "border-border bg-surface-elevated text-text-secondary hover:text-text-primary"
            }`}
          >
            <SlidersHorizontal size={15} />
            <ChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* Collapsed inline settings strip */}
      {!expanded && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-bg/20 px-4 py-2.5 sm:px-5">
          <InlineSetting
            icon={Gauge}
            label="Risk"
            value={source.override_risk_enabled && source.override_risk_pct != null ? `${source.override_risk_pct}%` : "global"}
            custom={source.override_risk_enabled}
          />
          <InlineSetting
            icon={ListFilter}
            label="Daily limit"
            value={source.daily_signal_limit != null ? `${source.daily_signal_limit}/day` : "global"}
            custom={source.daily_signal_limit != null}
          />
          <InlineSetting
            icon={ShieldHalf}
            label="SL"
            value={source.sl_policy === "require" ? "Require" : source.sl_policy === "apply_default" ? "Auto" : "global"}
            custom={source.sl_policy != null}
          />
          {source.reverse_trades && (
            <InlineSetting icon={Repeat2} label="" value="Reversed" custom />
          )}
        </div>
      )}

      {expanded && (
        <OverridePanel
          source={source}
          globalRiskPct={globalRiskPct}
          globalDailyLimit={globalDailyLimit}
          brokerLabel={brokerLabel}
          onPatch={onPatch}
        />
      )}
    </div>
  );
}

/* ─── Empty state ───────────────────────────────────────────────────────────── */

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="anim-fade flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center">
      <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary-light">
        <Send size={28} />
        <span className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg bg-surface-elevated text-primary-light">
          <Plus size={14} strokeWidth={2.5} />
        </span>
      </span>
      <h3 className="mt-5 text-[18px] font-bold tracking-tight text-text-primary">No channels yet</h3>
      <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-text-secondary">
        Connect a Telegram signal channel and VouchFX will parse every signal and copy it onto your MT5 account under your risk rules.
      </p>
      <button
        onClick={onAdd}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-[#04201D] transition-colors hover:bg-primary-light"
      >
        <Plus size={17} strokeWidth={2.5} /> Add your first channel
      </button>
      <div className="num mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck size={12} className="text-primary-light" /> Read-only Telegram</span>
        <span className="inline-flex items-center gap-1.5"><Zap size={12} className="text-primary-light" /> AI-parsed signals</span>
        <span className="inline-flex items-center gap-1.5"><Gauge size={12} className="text-primary-light" /> Your risk rules</span>
      </div>
    </div>
  );
}

/* ─── Summary strip ─────────────────────────────────────────────────────────── */

function SummaryStrip({ sources }: { sources: ChannelSource[] }) {
  const live = sources.filter((s) => statusOf(s).live).length;
  const paused = sources.filter((s) => !s.is_enabled).length;
  const signals = sources.reduce((a, s) => a + s.signals_today, 0);
  const stats: [string, number, React.ElementType, string][] = [
    ["Channels", sources.length, Send, "text-text-primary"],
    ["Live", live, CircleCheck, "text-profit"],
    ["Paused", paused, PauseCircle, "text-warning"],
    ["Signals today", signals, Zap, "text-text-primary"],
  ];
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map(([label, val, Icon, color]) => (
        <div key={label} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated">
            <Icon size={16} className={color} />
          </span>
          <div className="min-w-0">
            <div className={`num text-[19px] font-bold leading-none ${color}`}>{val}</div>
            <div className="mt-1 truncate text-[11px] text-text-muted">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main list ─────────────────────────────────────────────────────────────── */

export default function ChannelList({ initialSources, globalRiskPct, globalDailyLimit, brokerLabel }: ChannelListProps) {
  const [sources, setSources] = useState<ChannelSource[]>(initialSources);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [killTarget, setKillTarget] = useState<ChannelSource | null>(null);
  const [killing, setKilling] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>, optimistic: Partial<ChannelSource>) => {
      setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...optimistic } : s)));
      const res = await fetch(`/api/channels/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        flash((json.error as string) ?? "Update failed");
      }
    },
    [flash]
  );

  const handleToggleEnabled = useCallback(
    (source: ChannelSource, v: boolean) => {
      if (!v) {
        // Disabling → kill-switch decision
        setKillTarget(source);
      } else {
        patch(source.id, { is_enabled: true }, { is_enabled: true });
        flash(`${titleOf(source)} resumed`);
      }
    },
    [patch, flash]
  );

  const handleKillConfirm = useCallback(
    async (action: KillAction) => {
      if (!killTarget) return;
      setKilling(true);
      const title = titleOf(killTarget);
      try {
        if (action === "keep") {
          await patch(killTarget.id, { is_enabled: false }, { is_enabled: false });
          flash(`${title} paused — trades kept open`);
        } else {
          const res = await fetch(`/api/channels/${killTarget.id}`, { method: "POST" });
          if (res.ok) {
            // Executor closes the trades and removes the source
            setSources((prev) => prev.filter((s) => s.id !== killTarget.id));
            flash(`${title} paused — closing all trades`);
          } else {
            flash("Kill switch failed — try again");
          }
        }
      } finally {
        setKilling(false);
        setKillTarget(null);
      }
    },
    [killTarget, patch, flash]
  );

  const handleAdded = useCallback(
    (s: ChannelSource) => {
      setSources((prev) => [s, ...prev]);
      setAddOpen(false);
      flash(`${titleOf(s)} added`);
    },
    [flash]
  );

  const existingChatIds = new Set(sources.map((s) => s.telegram_chat_id));

  return (
    <div className="mt-6">
      {/* Add button row */}
      <div className="mb-5 flex items-center justify-end">
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-[13px] font-semibold text-[#04201D] transition-colors hover:bg-primary-light"
        >
          <Plus size={16} strokeWidth={2.5} /> Add channel
        </button>
      </div>

      {sources.length > 0 && <SummaryStrip sources={sources} />}

      {sources.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        <div className="flex flex-col gap-3.5">
          {sources.map((s) => (
            <ChannelCard
              key={s.id}
              source={s}
              globalRiskPct={globalRiskPct}
              globalDailyLimit={globalDailyLimit}
              brokerLabel={brokerLabel}
              expanded={expandedId === s.id}
              onToggleExpand={() => setExpandedId((prev) => (prev === s.id ? null : s.id))}
              onToggleEnabled={(v) => handleToggleEnabled(s, v)}
              onKill={() => setKillTarget(s)}
              onPatch={patch}
            />
          ))}
          <button
            onClick={() => setAddOpen(true)}
            className="group flex items-center justify-center gap-2.5 rounded-2xl border border-dashed border-border bg-surface/40 px-4 py-5 text-[13.5px] font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:bg-primary/[0.04] hover:text-text-primary"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-elevated text-primary-light transition-colors group-hover:border-primary/40">
              <Plus size={17} strokeWidth={2.5} />
            </span>
            Add another channel
          </button>
        </div>
      )}

      {killTarget && (
        <KillModal
          title={titleOf(killTarget)}
          busy={killing}
          onClose={() => setKillTarget(null)}
          onConfirm={handleKillConfirm}
        />
      )}
      {addOpen && (
        <AddModal existingChatIds={existingChatIds} onClose={() => setAddOpen(false)} onAdded={handleAdded} />
      )}

      {toast && (
        <div className="anim-fade fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 lg:bottom-6">
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-elevated px-4 py-3 shadow-2xl">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary-light">
              <Check size={14} strokeWidth={2.5} />
            </span>
            <span className="text-[13px] font-medium text-text-primary">{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
