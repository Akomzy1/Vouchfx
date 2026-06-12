"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Target, Clock, TrendingDown,
  BarChart2, Zap, Calendar, ChevronDown, Shield, Lock, Info,
  Loader2,
} from "lucide-react";
import type { StealthConfig } from "@vouchfx/core";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BrokerRow {
  id: string;
  label: string | null;
  last_balance_usd: number | null;
  last_equity_usd: number | null;
  last_synced_at: string | null;
}

interface RulesetRow {
  id: string;
  challenge_name: string;
  version: number;
  status: string;
  daily_loss_pct: number;
  daily_loss_basis: string;
  max_drawdown_pct: number;
  max_drawdown_model: string;
  consistency_pct: number | null;
  news_before_min: number;
  news_after_min: number;
  weekend_holding_allowed: boolean;
  min_trading_days: number;
  copy_trading_permitted: boolean;
  verified_at: string | null;
  prop_firms: {
    id: string;
    name: string;
    slug: string;
  };
}

interface ProfileRow {
  id: string;
  broker_connection_id: string;
  enabled: boolean;
  stealth_config: StealthConfig | null;
  challenge_start_balance_usd: number | null;
  ruleset_id: string;
  prop_rulesets: RulesetRow;
}

interface EquityStateRow {
  broker_connection_id: string;
  day_start_equity_usd: number;
  day_start_balance_usd: number;
  peak_equity_usd: number;
  eod_peak_balance_usd: number;
  last_equity_usd: number;
  last_balance_usd: number;
  current_day_key: string;
  guardian_active: boolean;
  flattened_at: string | null;
  flattened_reason: string | null;
  updated_at: string;
}

interface DailyPnlRow {
  broker_connection_id: string;
  day_key: string;
  realized_pnl_usd: number;
}

interface FirmRow {
  id: string;
  name: string;
  slug: string;
  prop_rulesets: {
    id: string;
    challenge_name: string;
    daily_loss_pct: number;
    daily_loss_basis: string;
    max_drawdown_pct: number;
    max_drawdown_model: string;
    consistency_pct: number | null;
    news_before_min: number;
    news_after_min: number;
    weekend_holding_allowed: boolean;
    min_trading_days: number;
    copy_trading_permitted: boolean;
    verified_at: string | null;
  }[];
}

interface Props {
  userId: string;
  brokers: BrokerRow[];
  profiles: ProfileRow[];
  firms: FirmRow[];
  equityStates: EquityStateRow[];
  dailyPnl: DailyPnlRow[];
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

type StatusColor = "green" | "amber" | "red" | "neutral";

function statusColor(usedPct: number): StatusColor {
  if (usedPct >= 95) return "red";
  if (usedPct >= 70) return "amber";
  return "green";
}

function statusPill(color: StatusColor, label: string) {
  const cls = {
    green: "bg-profit/10 text-profit border border-profit/20",
    amber: "bg-warning/10 text-warning border border-warning/20",
    red: "bg-loss/10 text-loss border border-loss/20",
    neutral: "bg-surface-elevated text-text-muted border border-border",
  }[color];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

const DEFAULT_STEALTH: StealthConfig = {
  enabled: true,
  lotJitterFraction: 0.10,
  slTpJitterPips: 2,
  delayRangeMs: [200, 1500],
  orderComment: "",
};

// ── Rule Card ─────────────────────────────────────────────────────────────────

function RuleCard({
  title,
  icon,
  usedPct,
  usedLabel,
  limitLabel,
  note,
  paused,
}: {
  title: string;
  icon: React.ReactNode;
  usedPct: number;
  usedLabel: string;
  limitLabel: string;
  note?: string;
  paused?: boolean;
}) {
  const clampedPct = Math.min(100, Math.max(0, usedPct));
  const color = paused ? "red" : statusColor(usedPct);

  const barColor = {
    green: "bg-profit",
    amber: "bg-warning",
    red: "bg-loss",
    neutral: "bg-border",
  }[color];

  const statusLabel = paused ? "Paused" : color === "red" ? "Critical" : color === "amber" ? "Warning" : "OK";

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-text-muted">{icon}</span>
          <p className="text-sm font-medium text-text-primary">{title}</p>
        </div>
        {statusPill(color, statusLabel)}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-text-muted">
          <span>{usedLabel}</span>
          <span>{limitLabel}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-surface-elevated overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${clampedPct}%` }}
          />
        </div>
        <p className="text-xs text-text-muted text-right tabular-nums">
          {clampedPct.toFixed(1)}% used
        </p>
      </div>

      {note && (
        <p className="text-xs text-text-muted border-t border-border pt-2">{note}</p>
      )}
    </div>
  );
}

// ── Equity Gauge Panel ────────────────────────────────────────────────────────

function EquityGaugePanel({
  equityState,
  challengeStartBalance,
  ruleset,
}: {
  equityState: EquityStateRow;
  challengeStartBalance: number;
  ruleset: RulesetRow;
}) {
  const { last_equity_usd, day_start_balance_usd, day_start_equity_usd,
          peak_equity_usd, eod_peak_balance_usd, guardian_active, flattened_at, flattened_reason } = equityState;

  // Compute floors
  const dailyBasisValue = ruleset.daily_loss_basis === "equity"
    ? day_start_equity_usd : day_start_balance_usd;
  const dailyLossFloor = dailyBasisValue * (1 - ruleset.daily_loss_pct / 100);

  let drawdownFloor: number;
  if (ruleset.max_drawdown_model === "static") {
    drawdownFloor = challengeStartBalance * (1 - ruleset.max_drawdown_pct / 100);
  } else if (ruleset.max_drawdown_model === "eod_trailing") {
    drawdownFloor = eod_peak_balance_usd * (1 - ruleset.max_drawdown_pct / 100);
  } else {
    drawdownFloor = peak_equity_usd * (1 - ruleset.max_drawdown_pct / 100);
  }

  const effectiveFloor = Math.max(dailyLossFloor, drawdownFloor);
  const bufferUsd = challengeStartBalance * 0.005;
  const bufferFloor = effectiveFloor + bufferUsd;

  const currentEquity = last_equity_usd;
  const distanceFromFloor = currentEquity - effectiveFloor;
  const distanceFromBuffer = currentEquity - bufferFloor;

  // Gauge: 0..challengeStartBalance mapped to 0..100%
  const floorPct = (effectiveFloor / challengeStartBalance) * 100;
  const bufferPct = (bufferFloor / challengeStartBalance) * 100;
  const equityPct = Math.min(100, (currentEquity / challengeStartBalance) * 100);

  const gaugeStatus =
    currentEquity <= effectiveFloor ? "red" :
    currentEquity <= bufferFloor    ? "amber" : "green";

  const gaugeColor = { green: "bg-profit", amber: "bg-warning", red: "bg-loss" }[gaugeStatus];
  const statusText = {
    green: "Safe zone",
    amber: "Buffer zone — approaching floor",
    red: flattened_at ? "Floor breached — positions flattened" : "Floor breached",
  }[gaugeStatus];

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-text-muted" />
          <p className="text-sm font-medium text-text-primary">Equity Guardian</p>
        </div>
        <div className="flex items-center gap-2">
          {statusPill(gaugeStatus, statusText)}
          {!guardian_active && (
            <span className="text-xs text-text-muted">(paused)</span>
          )}
        </div>
      </div>

      {flattened_at && (
        <div className="rounded-lg border border-loss/30 bg-loss/5 px-3 py-2 text-xs text-loss">
          Auto-flattened at {new Date(flattened_at).toUTCString().slice(0, 22)} UTC
          {flattened_reason && ` — ${flattened_reason}`}
        </div>
      )}

      {/* Gauge bar */}
      <div className="space-y-2">
        <div className="relative h-3 w-full rounded-full bg-surface-elevated overflow-hidden">
          {/* Floor zone (danger, below effective floor) */}
          <div
            className="absolute inset-y-0 left-0 bg-loss/20"
            style={{ width: `${floorPct}%` }}
          />
          {/* Buffer zone */}
          <div
            className="absolute inset-y-0 bg-warning/20"
            style={{ left: `${floorPct}%`, width: `${bufferPct - floorPct}%` }}
          />
          {/* Current equity marker */}
          <div
            className={`absolute inset-y-0 left-0 ${gaugeColor} opacity-80 transition-all duration-500`}
            style={{ width: `${equityPct}%` }}
          />
          {/* Floor line */}
          <div
            className="absolute inset-y-0 w-0.5 bg-loss/70"
            style={{ left: `${floorPct}%` }}
          />
          {/* Buffer line */}
          <div
            className="absolute inset-y-0 w-0.5 bg-warning/50"
            style={{ left: `${bufferPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-text-muted tabular-nums">
          <span>Floor {fmtUsd(effectiveFloor)}</span>
          <span className="font-medium text-text-primary">{fmtUsd(currentEquity)}</span>
          <span>{fmtUsd(challengeStartBalance)}</span>
        </div>
      </div>

      {/* Floor breakdown */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        {[
          { label: "Daily loss floor", value: dailyLossFloor, isActive: dailyLossFloor >= drawdownFloor },
          { label: "Drawdown floor", value: drawdownFloor, isActive: drawdownFloor > dailyLossFloor },
          { label: "Distance to floor", value: distanceFromFloor, highlight: distanceFromFloor < bufferUsd * 2 },
        ].map(({ label, value, isActive, highlight }) => (
          <div key={label} className="card bg-surface-elevated p-3 text-center">
            <p className={`num text-sm font-semibold tabular-nums ${
              highlight ? "text-warning" : isActive ? "text-primary" : "text-text-secondary"
            }`}>
              {fmtUsd(value)}
            </p>
            <p className="text-xs text-text-muted mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {distanceFromBuffer < 0 && !flattened_at && (
        <p className="text-xs text-warning">
          Within buffer zone. New signal execution may be paused.
        </p>
      )}
    </div>
  );
}

// ── Consistency Meter ─────────────────────────────────────────────────────────

function ConsistencyMeter({
  dailyPnl,
  consistencyPct,
}: {
  dailyPnl: { dayKey: string; realizedPnlUsd: number }[];
  consistencyPct: number;
}) {
  const today = todayKey();
  const last14 = dailyPnl.slice(-14);

  // Compute cap from prior profitable days
  const priorProfit = dailyPnl
    .filter((d) => d.dayKey !== today && d.realizedPnlUsd > 0)
    .reduce((s, d) => s + d.realizedPnlUsd, 0);
  const dailyCap = priorProfit > 0 ? priorProfit * (consistencyPct / 100) : null;

  const todayEntry = dailyPnl.find((d) => d.dayKey === today);
  const todayProfit = Math.max(0, todayEntry?.realizedPnlUsd ?? 0);
  const utilizationPct = dailyCap && dailyCap > 0 ? (todayProfit / dailyCap) * 100 : 0;

  const action = dailyCap === null ? "ok"
    : utilizationPct >= 100 ? "pause"
    : utilizationPct >= 85 ? "throttle"
    : "ok";

  const maxAbs = Math.max(1, ...last14.map((d) => Math.abs(d.realizedPnlUsd)));
  const capBarPct = dailyCap ? Math.min(100, (dailyCap / maxAbs) * 50) : null;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-text-muted" />
          <p className="text-sm font-medium text-text-primary">Consistency Meter</p>
        </div>
        <div className="flex items-center gap-3">
          {dailyCap !== null && (
            <p className="text-xs text-text-muted tabular-nums">
              Cap: {fmtUsd(dailyCap)} / day
            </p>
          )}
          {statusPill(
            action === "pause" ? "red" : action === "throttle" ? "amber" : "green",
            action === "pause" ? "Paused" : action === "throttle" ? "Throttling" : "OK",
          )}
        </div>
      </div>

      {last14.length === 0 ? (
        <p className="text-xs text-text-muted text-center py-4">No trading days recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {/* Bar chart */}
          <div className="relative flex items-end gap-1 h-20">
            {last14.map(({ dayKey, realizedPnlUsd }) => {
              const isToday = dayKey === today;
              const pct = Math.abs(realizedPnlUsd) / maxAbs * 100;
              const isProfit = realizedPnlUsd >= 0;
              return (
                <div
                  key={dayKey}
                  title={`${dayKey}: ${fmtUsd(realizedPnlUsd)}`}
                  className="flex-1 flex flex-col items-center justify-end h-full"
                >
                  <div
                    className={`w-full rounded-t-sm transition-all ${
                      isProfit ? "bg-profit" : "bg-loss"
                    } ${isToday ? "opacity-100 ring-1 ring-primary" : "opacity-60"}`}
                    style={{ height: `${Math.max(2, pct)}%` }}
                  />
                </div>
              );
            })}
            {/* Daily cap line */}
            {capBarPct !== null && (
              <div
                className="absolute inset-x-0 border-t border-dashed border-warning/70"
                style={{ bottom: `${capBarPct}%` }}
              />
            )}
          </div>
          {/* Today's utilization */}
          {dailyCap !== null && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-text-muted">
                <span>Today {fmtUsd(todayProfit)}</span>
                <span>Cap {fmtUsd(dailyCap)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    action === "pause" ? "bg-loss" : action === "throttle" ? "bg-warning" : "bg-profit"
                  }`}
                  style={{ width: `${Math.min(100, utilizationPct)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {action === "pause" && (
        <p className="text-xs text-loss">
          Today&apos;s profit has reached the {consistencyPct}% consistency cap. Signal copying paused for today.
        </p>
      )}
      {action === "throttle" && (
        <p className="text-xs text-warning">
          Approaching consistency cap ({utilizationPct.toFixed(0)}%). New signals are being throttled.
        </p>
      )}
    </div>
  );
}

// ── Stealth Strip ─────────────────────────────────────────────────────────────

function StealthStrip({
  profileId,
  initial,
}: {
  profileId: string;
  initial: StealthConfig | null;
}) {
  const [config, setConfig] = useState<StealthConfig>(initial ?? DEFAULT_STEALTH);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/prop/stealth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, config }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? "Save failed");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }, [profileId, config]);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Zap size={16} className="text-text-muted" />
        <p className="text-sm font-medium text-text-primary">Stealth Execution</p>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-text-muted">
          <Info size={12} />
          <span>Reduces but does not eliminate copy-group detection risk.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Enabled toggle */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-text-secondary">Stealth enabled</p>
          <button
            onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              config.enabled ? "bg-primary" : "bg-surface-elevated border border-border"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                config.enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Lot variation */}
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <p className="text-xs font-medium text-text-secondary">Lot variation</p>
            <p className="text-xs tabular-nums text-text-muted">
              ±{(config.lotJitterFraction * 100).toFixed(0)}%
            </p>
          </div>
          <input
            type="range"
            min={0} max={25} step={1}
            value={config.lotJitterFraction * 100}
            disabled={!config.enabled}
            onChange={(e) =>
              setConfig((c) => ({ ...c, lotJitterFraction: Number(e.target.value) / 100 }))
            }
            className="w-full accent-primary disabled:opacity-40"
          />
          <div className="flex justify-between text-2xs text-text-muted">
            <span>0%</span><span>25%</span>
          </div>
        </div>

        {/* SL/TP jitter */}
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <p className="text-xs font-medium text-text-secondary">SL/TP jitter</p>
            <p className="text-xs tabular-nums text-text-muted">
              ±{config.slTpJitterPips} pips
            </p>
          </div>
          <input
            type="range"
            min={0} max={5} step={1}
            value={config.slTpJitterPips}
            disabled={!config.enabled}
            onChange={(e) =>
              setConfig((c) => ({ ...c, slTpJitterPips: Number(e.target.value) }))
            }
            className="w-full accent-primary disabled:opacity-40"
          />
          <div className="flex justify-between text-2xs text-text-muted">
            <span>0</span><span>5 pips</span>
          </div>
        </div>

        {/* Order delay */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-text-secondary">Order delay</p>
          <p className="text-sm tabular-nums text-text-primary">
            {config.delayRangeMs[0]}–{config.delayRangeMs[1]} ms
          </p>
          <p className="text-xs text-text-muted">Fixed range, randomised per trade.</p>
        </div>
      </div>

      {/* Order comment */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-xs font-medium text-text-secondary mb-1">Order comment</p>
          <input
            type="text"
            value={config.orderComment}
            maxLength={64}
            placeholder="Leave empty (recommended) — never include channel name"
            disabled={!config.enabled}
            onChange={(e) => setConfig((c) => ({ ...c, orderComment: e.target.value }))}
            className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-xs text-text-primary placeholder-text-muted focus:border-primary focus:outline-none disabled:opacity-40"
          />
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="mt-5 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : null}
          {saved ? "Saved" : "Save"}
        </button>
      </div>

      {error && <p className="text-xs text-loss">{error}</p>}

      <p className="text-xs text-text-muted border-t border-border pt-3">
        Stealth variation stays within your risk budget. Lot is clamped to broker min/max. SL/TP are
        always moved away from entry (safer direction), never toward it.
      </p>
    </div>
  );
}

// ── Enable Prop Mode Form ─────────────────────────────────────────────────────

function EnablePropForm({
  broker,
  firms,
  onSuccess,
}: {
  broker: BrokerRow;
  firms: FirmRow[];
  onSuccess: () => void;
}) {
  const [firmId, setFirmId] = useState<string>("");
  const [rulesetId, setRulesetId] = useState<string>("");
  const [startBalance, setStartBalance] = useState<string>(
    broker.last_balance_usd?.toFixed(2) ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedFirm = firms.find((f) => f.id === firmId);
  const rulesetOptions = selectedFirm?.prop_rulesets ?? [];

  const handleFirmChange = (id: string) => {
    setFirmId(id);
    setRulesetId("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rulesetId || !startBalance) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/prop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brokerId: broker.id,
          rulesetId,
          challengeStartBalanceUsd: Number(startBalance),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? "Failed to enable prop mode");
      } else {
        onSuccess();
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="card p-5 space-y-4 border border-primary/20">
      <div className="flex items-center gap-2">
        <Target size={16} className="text-primary" />
        <p className="text-sm font-medium text-text-primary">Enable Prop Mode</p>
      </div>
      <p className="text-xs text-text-muted">
        Link this account to a prop firm preset so VouchFX can enforce the firm&apos;s trading rules
        before placing orders.
      </p>

      {/* Firm picker */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-text-secondary">Prop firm</label>
        <div className="relative">
          <select
            value={firmId}
            onChange={(e) => handleFirmChange(e.target.value)}
            required
            className="w-full appearance-none rounded-lg border border-border bg-surface-elevated px-3 py-2 pr-8 text-sm text-text-primary focus:border-primary focus:outline-none"
          >
            <option value="">Select a firm…</option>
            {firms.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-3 top-2.5 text-text-muted" />
        </div>
      </div>

      {/* Challenge picker */}
      {rulesetOptions.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-secondary">Challenge type</label>
          <div className="relative">
            <select
              value={rulesetId}
              onChange={(e) => setRulesetId(e.target.value)}
              required
              className="w-full appearance-none rounded-lg border border-border bg-surface-elevated px-3 py-2 pr-8 text-sm text-text-primary focus:border-primary focus:outline-none"
            >
              <option value="">Select challenge…</option>
              {rulesetOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.challenge_name} — {r.max_drawdown_pct}% DD / {r.daily_loss_pct}% daily
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-2.5 text-text-muted" />
          </div>
        </div>
      )}

      {/* Starting balance */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-text-secondary">
          Challenge starting balance (USD)
        </label>
        <input
          type="number"
          min={100}
          step={0.01}
          value={startBalance}
          onChange={(e) => setStartBalance(e.target.value)}
          required
          placeholder="e.g. 100000"
          className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none"
        />
        <p className="text-xs text-text-muted">
          Set this to the account balance at challenge start — used to calculate the static drawdown floor.
        </p>
      </div>

      {error && <p className="text-xs text-loss">{error}</p>}

      <button
        type="submit"
        disabled={saving || !firmId || !rulesetId || !startBalance}
        className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        Enable Prop Mode
      </button>
    </form>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PropModeClient({
  userId,
  brokers,
  profiles,
  firms,
  equityStates,
  dailyPnl,
}: Props) {
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>(
    profiles[0]?.broker_connection_id ?? brokers[0]?.id ?? ""
  );
  const [enablingFor, setEnablingFor] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [liveEquityState, setLiveEquityState] = useState<EquityStateRow[]>(equityStates);

  // Realtime subscription on prop_equity_state
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel("prop-equity-state")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prop_equity_state", filter: `user_id=eq.${userId}` },
        (payload) => {
          setLiveEquityState((prev) => {
            const updated = payload.new as EquityStateRow;
            const idx = prev.findIndex((s) => s.broker_connection_id === updated.broker_connection_id);
            if (idx === -1) return [...prev, updated];
            const next = [...prev];
            next[idx] = updated;
            return next;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const selectedProfile = profiles.find((p) => p.broker_connection_id === selectedBrokerId);
  const selectedBroker = brokers.find((b) => b.id === selectedBrokerId);
  const selectedEquityState = liveEquityState.find((s) => s.broker_connection_id === selectedBrokerId);
  const selectedDailyPnl = dailyPnl
    .filter((d) => d.broker_connection_id === selectedBrokerId)
    .map((d) => ({ dayKey: d.day_key, realizedPnlUsd: d.realized_pnl_usd }));

  const ruleset = selectedProfile?.prop_rulesets ?? null;
  const firm = ruleset?.prop_firms ?? null;

  // ── Empty state: no broker connections ──────────────────────────────────────
  if (brokers.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <div className="card p-10 text-center space-y-3">
          <Target size={32} className="mx-auto text-text-muted" />
          <p className="text-sm font-medium text-text-primary">No broker connected</p>
          <p className="text-xs text-text-muted">
            Connect an MT5 account first, then come back to enable Prop Mode.
          </p>
          <a href="/settings" className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Connect broker
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" key={refreshKey}>
      {/* Header + account selector */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader />
        {brokers.length > 1 && (
          <div className="relative">
            <select
              value={selectedBrokerId}
              onChange={(e) => setSelectedBrokerId(e.target.value)}
              className="appearance-none rounded-lg border border-border bg-surface px-3 py-1.5 pr-8 text-sm text-text-primary focus:border-primary focus:outline-none"
            >
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label ?? b.id.slice(0, 8)}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-2 text-text-muted" />
          </div>
        )}
      </div>

      {/* No prop profile on selected account */}
      {!selectedProfile && selectedBroker && (
        <>
          {enablingFor === selectedBrokerId ? (
            <EnablePropForm
              broker={selectedBroker}
              firms={firms}
              onSuccess={() => {
                setEnablingFor(null);
                setRefreshKey((k) => k + 1);
                window.location.reload();
              }}
            />
          ) : (
            <div className="card p-8 text-center space-y-3 border border-dashed border-border">
              <Target size={28} className="mx-auto text-text-muted" />
              <p className="text-sm font-medium text-text-primary">Prop Mode not enabled for this account</p>
              <p className="text-xs text-text-muted max-w-sm mx-auto">
                Enable Prop Mode to enforce your firm&apos;s trading rules — daily loss limits,
                drawdown protection, consistency checks, and stealth execution.
              </p>
              <button
                onClick={() => setEnablingFor(selectedBrokerId)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <Target size={14} />
                Enable Prop Mode
              </button>
            </div>
          )}
        </>
      )}

      {/* Profile active */}
      {selectedProfile && ruleset && firm && (
        <>
          {/* Firm info header */}
          <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-text-primary">
                  {firm.name}
                </p>
                <span className="rounded bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
                  {ruleset.challenge_name}
                </span>
                <span className="rounded bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
                  v{ruleset.version}
                </span>
              </div>
              <p className="text-xs text-text-muted">
                Rules last verified:{" "}
                {ruleset.verified_at ? timeAgo(ruleset.verified_at) : "never"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {statusPill(selectedProfile.enabled ? "green" : "neutral",
                selectedProfile.enabled ? "Prop Mode ON" : "Prop Mode OFF")}
              {!ruleset.copy_trading_permitted && (
                statusPill("red", "Copy trading restricted")
              )}
            </div>
          </div>

          {/* Copy restriction warning */}
          {!ruleset.copy_trading_permitted && (
            <div className="rounded-lg border border-loss/30 bg-loss/5 p-4 flex items-start gap-3">
              <Lock size={16} className="mt-0.5 shrink-0 text-loss" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-loss">Copy trading not permitted</p>
                <p className="text-xs text-text-secondary">
                  {firm.name}&apos;s rules indicate copy trading is not allowed on this challenge type.
                  VouchFX will not place trades on this account until a permitted ruleset is selected.
                  Verify the firm&apos;s current rules before proceeding.
                </p>
              </div>
            </div>
          )}

          {/* Rule cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            <DailyLossCard ruleset={ruleset} equityState={selectedEquityState} />
            <DrawdownCard ruleset={ruleset} equityState={selectedEquityState} profile={selectedProfile} />
            <ConsistencyCard ruleset={ruleset} dailyPnl={selectedDailyPnl} />
            <NewsWindowCard ruleset={ruleset} />
            <WeekendCard ruleset={ruleset} />
            <MinTradingDaysCard ruleset={ruleset} dailyPnl={selectedDailyPnl} />
          </div>

          {/* Equity Guardian panel */}
          {selectedEquityState && selectedProfile.challenge_start_balance_usd != null && (
            <EquityGaugePanel
              equityState={selectedEquityState}
              challengeStartBalance={selectedProfile.challenge_start_balance_usd}
              ruleset={ruleset}
            />
          )}

          {/* No equity state yet */}
          {!selectedEquityState && (
            <div className="card p-4 flex items-center gap-3 text-sm text-text-muted">
              <Shield size={16} />
              <span>
                Equity Guardian will activate once the executor processes the first equity tick for
                this account.
              </span>
            </div>
          )}

          {/* Consistency meter */}
          {ruleset.consistency_pct != null && (
            <ConsistencyMeter
              dailyPnl={selectedDailyPnl}
              consistencyPct={ruleset.consistency_pct}
            />
          )}

          {/* Stealth strip */}
          <StealthStrip profileId={selectedProfile.id} initial={selectedProfile.stealth_config} />
        </>
      )}
    </div>
  );
}

// ── Page Header ───────────────────────────────────────────────────────────────

function PageHeader() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-text-primary flex items-center gap-2">
        <Target size={20} />
        Prop Mode
      </h1>
      <p className="text-sm text-text-secondary mt-0.5">
        Enforce your prop firm&apos;s trading rules before every signal execution.
      </p>
    </div>
  );
}

// ── Individual Rule Cards ─────────────────────────────────────────────────────

function DailyLossCard({
  ruleset,
  equityState,
}: {
  ruleset: RulesetRow;
  equityState?: EquityStateRow;
}) {
  let usedPct = 0;
  let usedLabel = "—";
  let limitLabel = `${ruleset.daily_loss_pct}% limit`;

  if (equityState) {
    const basis =
      ruleset.daily_loss_basis === "equity"
        ? equityState.day_start_equity_usd
        : equityState.day_start_balance_usd;
    const lossLimit = basis * (ruleset.daily_loss_pct / 100);
    const current =
      ruleset.daily_loss_basis === "equity"
        ? equityState.day_start_equity_usd - equityState.last_equity_usd
        : equityState.day_start_balance_usd - equityState.last_balance_usd;
    const loss = Math.max(0, current);
    usedPct = lossLimit > 0 ? (loss / lossLimit) * 100 : 0;
    usedLabel = `${fmtUsd(loss)} loss`;
    limitLabel = `${fmtUsd(lossLimit)} limit`;
  }

  return (
    <RuleCard
      title="Daily Loss"
      icon={<TrendingDown size={14} />}
      usedPct={usedPct}
      usedLabel={usedLabel}
      limitLabel={limitLabel}
      note={`Based on ${ruleset.daily_loss_basis} — resets each UTC day`}
    />
  );
}

function DrawdownCard({
  ruleset,
  equityState,
  profile,
}: {
  ruleset: RulesetRow;
  equityState?: EquityStateRow;
  profile: ProfileRow;
}) {
  let usedPct = 0;
  let usedLabel = "—";
  const limitLabel = `${ruleset.max_drawdown_pct}% limit`;

  if (equityState) {
    const anchor =
      ruleset.max_drawdown_model === "static"
        ? (profile.challenge_start_balance_usd ?? equityState.last_balance_usd)
        : ruleset.max_drawdown_model === "eod_trailing"
        ? equityState.eod_peak_balance_usd
        : equityState.peak_equity_usd;
    const floor = anchor * (1 - ruleset.max_drawdown_pct / 100);
    const loss = Math.max(0, anchor - equityState.last_equity_usd);
    const budget = anchor * (ruleset.max_drawdown_pct / 100);
    usedPct = budget > 0 ? (loss / budget) * 100 : 0;
    usedLabel = `${fmtUsd(loss)} drawn`;
    void floor;
  }

  const modelLabel = {
    static: "Static from challenge start",
    eod_trailing: "EOD trailing peak",
    intraday_trailing: "Intraday trailing peak",
  }[ruleset.max_drawdown_model] ?? ruleset.max_drawdown_model;

  return (
    <RuleCard
      title="Max Drawdown"
      icon={<Shield size={14} />}
      usedPct={usedPct}
      usedLabel={usedLabel}
      limitLabel={limitLabel}
      note={modelLabel}
    />
  );
}

function ConsistencyCard({
  ruleset,
  dailyPnl,
}: {
  ruleset: RulesetRow;
  dailyPnl: { dayKey: string; realizedPnlUsd: number }[];
}) {
  if (ruleset.consistency_pct == null) {
    return (
      <RuleCard
        title="Consistency"
        icon={<BarChart2 size={14} />}
        usedPct={0}
        usedLabel="Not required"
        limitLabel="No limit"
        note="This challenge has no consistency rule."
      />
    );
  }

  const today = todayKey();
  const priorProfit = dailyPnl
    .filter((d) => d.dayKey !== today && d.realizedPnlUsd > 0)
    .reduce((s, d) => s + d.realizedPnlUsd, 0);
  const dailyCap = priorProfit * (ruleset.consistency_pct / 100);
  const todayProfit = Math.max(0, dailyPnl.find((d) => d.dayKey === today)?.realizedPnlUsd ?? 0);
  const usedPct = dailyCap > 0 ? (todayProfit / dailyCap) * 100 : 0;
  const paused = usedPct >= 100;

  return (
    <RuleCard
      title="Consistency"
      icon={<BarChart2 size={14} />}
      usedPct={usedPct}
      usedLabel={dailyCap > 0 ? `${fmtUsd(todayProfit)} today` : "No cap yet"}
      limitLabel={dailyCap > 0 ? `${fmtUsd(dailyCap)} cap` : `${ruleset.consistency_pct}% rule`}
      note={`Max ${ruleset.consistency_pct}% of period profit in a single day`}
      paused={paused}
    />
  );
}

function NewsWindowCard({ ruleset }: { ruleset: RulesetRow }) {
  const hasNewsRule = ruleset.news_before_min > 0 || ruleset.news_after_min > 0;
  return (
    <RuleCard
      title="News Window"
      icon={<Clock size={14} />}
      usedPct={0}
      usedLabel={hasNewsRule ? "No active events" : "Disabled"}
      limitLabel={
        hasNewsRule
          ? `${ruleset.news_before_min}m before / ${ruleset.news_after_min}m after`
          : "No rule"
      }
      note={
        hasNewsRule
          ? "High-impact events pause execution automatically."
          : "This challenge has no news window rule."
      }
    />
  );
}

function WeekendCard({ ruleset }: { ruleset: RulesetRow }) {
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sun, 6=Sat
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const isFridayClose = utcDay === 5 && (utcH * 60 + utcM) >= (23 * 60 - 60);
  const isWeekend = utcDay === 0 || utcDay === 6 || isFridayClose;

  return (
    <RuleCard
      title="Weekend Holding"
      icon={<Calendar size={14} />}
      usedPct={0}
      usedLabel={
        ruleset.weekend_holding_allowed
          ? "Allowed"
          : isWeekend
          ? "Weekend — positions blocked"
          : "Weekday — OK"
      }
      limitLabel={ruleset.weekend_holding_allowed ? "No restriction" : "Positions auto-close Friday"}
      note={
        ruleset.weekend_holding_allowed
          ? undefined
          : "Open positions are closed before Friday 23:59 UTC."
      }
    />
  );
}

function MinTradingDaysCard({
  ruleset,
  dailyPnl,
}: {
  ruleset: RulesetRow;
  dailyPnl: { dayKey: string; realizedPnlUsd: number }[];
}) {
  if (!ruleset.min_trading_days || ruleset.min_trading_days === 0) {
    return (
      <RuleCard
        title="Trading Days"
        icon={<Calendar size={14} />}
        usedPct={100}
        usedLabel="No minimum"
        limitLabel="No rule"
        note="This challenge has no minimum trading-day requirement."
      />
    );
  }

  // A "trading day" = a day where at least one trade was made (realizedPnlUsd entry exists)
  const tradingDays = new Set(dailyPnl.map((d) => d.dayKey)).size;
  const usedPct = (tradingDays / ruleset.min_trading_days) * 100;

  return (
    <RuleCard
      title="Trading Days"
      icon={<Calendar size={14} />}
      usedPct={usedPct}
      usedLabel={`${tradingDays} days`}
      limitLabel={`${ruleset.min_trading_days} required`}
      note="Days with at least one executed trade."
    />
  );
}
