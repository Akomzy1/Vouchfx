"use client";

import { useState, useCallback } from "react";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type SizingMode    = "percent_balance" | "fixed_lot" | "fixed_usd_risk";
type SlPolicy      = "apply_default" | "skip" | "ask";
type LossAction    = "pause" | "pause_and_close";
type ExecutionMode = "apply_my_rules" | "mirror_provider";
type MirrorLotMode = "provider_lot" | "fixed_lot" | "risk_based";

export interface RiskSettings {
  execution_mode:        ExecutionMode;
  mirror_lot_mode:       MirrorLotMode;
  mirror_allow_no_sl:    boolean;
  sizing_mode:           SizingMode;
  risk_per_trade_pct:    number;
  fixed_lot_size:        number | null;
  fixed_usd_risk:        number | null;
  daily_signal_limit:    number;
  max_trades_per_day:    number | null;
  daily_loss_cap_pct:    number | null;
  daily_loss_cap_action: LossAction;
  default_sl_policy:     SlPolicy;
  default_sl_pips:       number | null;
  breakeven_after_tp1:   boolean;
  trailing_after_tp2:    boolean;
  news_filter_enabled:   boolean;
  news_filter_window_min: number;
}

// ── Reusable sub-components ───────────────────────────────────────────────────

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="card p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <p className="text-xs text-text-muted mt-0.5">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-6">
      <div className="w-full sm:w-44 shrink-0 pt-0.5">
        <p className="text-sm text-text-primary">{label}</p>
        {hint && <p className="text-xs text-text-muted mt-0.5">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder,
  suffix,
  className = "",
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  suffix?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? "" : Number(v));
        }}
        className="num w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary tabular-nums placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
      />
      {suffix && <span className="text-xs text-text-muted shrink-0">{suffix}</span>}
    </div>
  );
}

function RadioGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; sub?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <label key={opt.value} className="flex items-start gap-3 cursor-pointer group">
          <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border transition-colors group-hover:border-primary">
            {value === opt.value && (
              <div className="h-2 w-2 rounded-full bg-primary" />
            )}
            <input
              type="radio"
              className="sr-only"
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
            />
          </div>
          <div>
            <p className="text-sm text-text-primary">{opt.label}</p>
            {opt.sub && <p className="text-xs text-text-muted mt-0.5">{opt.sub}</p>}
          </div>
        </label>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        checked ? "bg-primary" : "bg-border"
      }`}
    >
      <span className="sr-only">{label}</span>
      <span
        className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            value === opt.value
              ? "bg-primary text-[#04201D]"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Checkbox({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border transition-colors hover:border-primary">
        {checked && (
          <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-primary" aria-hidden>
            <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </div>
      <div>
        <p className="text-sm text-text-primary">{label}</p>
        {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
      </div>
    </label>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

export default function RiskSettingsForm({ initial }: { initial: RiskSettings }) {
  const [s, setS] = useState<RiskSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  function update<K extends keyof RiskSettings>(key: K, value: RiskSettings[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  }

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      // Coerce "" → 0 / null for optional numeric fields
      const payload: Partial<RiskSettings> = {
        ...s,
        max_trades_per_day: s.max_trades_per_day === 0 ? null : s.max_trades_per_day,
        daily_loss_cap_pct: s.daily_loss_cap_pct === 0 ? null : s.daily_loss_cap_pct,
        fixed_lot_size:     s.sizing_mode !== "fixed_lot"   ? null : s.fixed_lot_size,
        fixed_usd_risk:     s.sizing_mode !== "fixed_usd_risk" ? null : s.fixed_usd_risk,
        default_sl_pips:    s.default_sl_policy !== "apply_default" ? null : s.default_sl_pips,
      };
      const res = await fetch("/api/risk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to save");
      setS(json.settings as RiskSettings);
      setSaved(true);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [s]);

  const showFixedLot  = s.sizing_mode === "fixed_lot";
  const showFixedUsd  = s.sizing_mode === "fixed_usd_risk";
  const showRiskPct   = s.sizing_mode === "percent_balance";
  const showSlPips    = s.default_sl_policy === "apply_default";
  const showLossAction = (s.daily_loss_cap_pct ?? 0) > 0;

  const isMirror = s.execution_mode === "mirror_provider";

  return (
    <div className="space-y-4 pb-24">

      {/* ── 01 Execution mode ── */}
      <Section
        title="01 Execution mode"
        sub="How VouchFX handles provider signals — apply your own risk rules or copy the provider's levels exactly."
      >
        <SegmentedControl<ExecutionMode>
          value={s.execution_mode}
          onChange={(v) => update("execution_mode", v)}
          options={[
            { value: "apply_my_rules", label: "Apply my risk rules" },
            { value: "mirror_provider", label: "Mirror provider exactly" },
          ]}
        />

        {isMirror && (
          <>
            <FieldRow
              label="Lot sizing"
              hint="How to determine trade volume when mirroring."
            >
              <RadioGroup<MirrorLotMode>
                value={s.mirror_lot_mode}
                onChange={(v) => update("mirror_lot_mode", v)}
                options={[
                  { value: "provider_lot", label: "Provider's stated lot", sub: "Use the lot size mentioned in the signal. Falls back to risk-based sizing if absent." },
                  { value: "fixed_lot",    label: "Fixed lot size",        sub: "Same fixed lot for every mirrored trade (configured in Position sizing below)." },
                  { value: "risk_based",   label: "Risk-based sizing",     sub: "Calculate volume from your risk % or dollar amount using the provider's SL distance." },
                ]}
              />
            </FieldRow>

            <Checkbox
              checked={s.mirror_allow_no_sl}
              onChange={(v) => update("mirror_allow_no_sl", v)}
              label="Allow trades with no stop loss — I understand the risk"
              sub="Without this, signals that arrive with no SL will be skipped in mirror mode."
            />

            <div className="rounded-lg border border-border/60 bg-surface-elevated px-3 py-2.5 text-xs text-text-muted">
              Daily signal limits, max trades per day, and the daily loss cap remain enforced in mirror mode.
            </div>
          </>
        )}
      </Section>

      {/* ── Position sizing ── */}
      <Section
        title="Position sizing"
        sub="How trade volume is calculated for each signal."
      >
        <RadioGroup<SizingMode>
          value={s.sizing_mode}
          onChange={(v) => update("sizing_mode", v)}
          options={[
            { value: "percent_balance", label: "% of account balance", sub: "Risk a fixed percentage of your current balance per trade." },
            { value: "fixed_usd_risk",  label: "Fixed USD risk",        sub: "Risk a specific dollar amount per trade regardless of balance." },
            { value: "fixed_lot",       label: "Fixed lot size",        sub: "Use the same lot size for every trade. No automatic sizing." },
          ]}
        />

        {showRiskPct && (
          <FieldRow label="Risk per trade" hint="0.5% is typical for funded-account rules.">
            <NumberInput
              value={s.risk_per_trade_pct}
              onChange={(v) => update("risk_per_trade_pct", v === "" ? 0.5 : v)}
              min={0.01} max={100} step={0.1}
              suffix="%"
              className="max-w-36"
            />
          </FieldRow>
        )}

        {showFixedUsd && (
          <FieldRow label="Fixed USD risk" hint="Dollar amount risked per trade.">
            <NumberInput
              value={s.fixed_usd_risk ?? ""}
              onChange={(v) => update("fixed_usd_risk", v === "" ? null : v)}
              min={1} step={1}
              suffix="USD"
              className="max-w-40"
            />
          </FieldRow>
        )}

        {showFixedLot && (
          <FieldRow label="Lot size" hint="Applied to every trade. Must meet broker minimums.">
            <NumberInput
              value={s.fixed_lot_size ?? ""}
              onChange={(v) => update("fixed_lot_size", v === "" ? null : v)}
              min={0.01} step={0.01}
              suffix="lots"
              className="max-w-36"
            />
          </FieldRow>
        )}
      </Section>

      {/* ── Stop-loss policy ── */}
      <Section
        title="Stop-loss policy"
        sub="What to do when a signal has no stop loss."
      >
        <RadioGroup<SlPolicy>
          value={s.default_sl_policy}
          onChange={(v) => update("default_sl_policy", v)}
          options={[
            { value: "skip",          label: "Skip (recommended)", sub: "Ignore any signal that arrives without a stop loss. Safest option." },
            { value: "apply_default", label: "Apply default SL",   sub: "Apply a fixed pip-distance stop loss from entry." },
            { value: "ask",           label: "Ask (not yet active)", sub: "Prompt for confirmation before executing — coming in a later phase." },
          ]}
        />

        {showSlPips && (
          <FieldRow label="Default SL distance" hint="Applied as pips from entry price when signal has no SL.">
            <NumberInput
              value={s.default_sl_pips ?? ""}
              onChange={(v) => update("default_sl_pips", v === "" ? null : v)}
              min={1} step={1}
              suffix="pips"
              className="max-w-36"
            />
          </FieldRow>
        )}
      </Section>

      {/* ── Daily limits ── */}
      <Section
        title="Daily limits"
        sub="Cap how much activity the system can take in a calendar day. 0 = unlimited."
      >
        <FieldRow label="Global signal limit" hint="Max unique signals to act on today across all channels.">
          <NumberInput
            value={s.daily_signal_limit}
            onChange={(v) => update("daily_signal_limit", v === "" ? 0 : v)}
            min={0} step={1}
            placeholder="0 = unlimited"
            className="max-w-44"
          />
        </FieldRow>

        <FieldRow label="Max trade legs/day" hint="Total order legs placed today (counts each TP separately). 0 = unlimited.">
          <NumberInput
            value={s.max_trades_per_day ?? 0}
            onChange={(v) => update("max_trades_per_day", v === "" || v === 0 ? null : v)}
            min={0} step={1}
            placeholder="0 = unlimited"
            className="max-w-44"
          />
        </FieldRow>
      </Section>

      {/* ── Drawdown guardian ── */}
      <Section
        title="Drawdown guardian"
        sub="Halt execution when intraday losses hit a threshold. 0 = disabled."
      >
        <FieldRow label="Daily loss cap" hint="As a percentage of opening balance. Calculated from realised + floating P&L.">
          <NumberInput
            value={s.daily_loss_cap_pct ?? 0}
            onChange={(v) => update("daily_loss_cap_pct", v === "" || v === 0 ? null : v)}
            min={0} max={100} step={0.1}
            suffix="%"
            className="max-w-36"
          />
        </FieldRow>

        {showLossAction && (
          <FieldRow label="On cap hit" hint="What to do when the daily loss cap is breached.">
            <RadioGroup<LossAction>
              value={s.daily_loss_cap_action}
              onChange={(v) => update("daily_loss_cap_action", v)}
              options={[
                { value: "pause",           label: "Pause new signals",              sub: "Stop taking new signals for today. Existing positions run." },
                { value: "pause_and_close", label: "Pause + close all open trades",  sub: "Also close every open position immediately." },
              ]}
            />
          </FieldRow>
        )}
      </Section>

      {/* ── Automation ── */}
      <Section
        title="Automation"
        sub="Automatic position management after partial closes."
      >
        <FieldRow
          label="Breakeven after TP1"
          hint="Move SL to entry price when the first take-profit is hit."
        >
          <Toggle
            checked={s.breakeven_after_tp1}
            onChange={(v) => update("breakeven_after_tp1", v)}
            label="Breakeven after TP1"
          />
        </FieldRow>

        <FieldRow
          label="Trailing after TP2"
          hint="Enable trailing stop once TP2 is hit. (Execution in next phase.)"
        >
          <Toggle
            checked={s.trailing_after_tp2}
            onChange={(v) => update("trailing_after_tp2", v)}
            label="Trailing after TP2"
          />
        </FieldRow>
      </Section>

      {/* ── 07 News filter ── */}
      <Section
        title="07 News filter"
        sub="Pause copying around high-impact economic events when spreads widen and price gaps are common."
      >
        <FieldRow
          label="Avoid high-impact news"
          hint="Skip signals that land inside the blackout window around red-folder events (NFP, CPI, rate decisions)."
        >
          <Toggle
            checked={s.news_filter_enabled}
            onChange={(v) => update("news_filter_enabled", v)}
            label="News filter"
          />
        </FieldRow>

        {s.news_filter_enabled && (
          <FieldRow
            label="Blackout window"
            hint="How long before and after each event VouchFX stops copying. Applied symmetrically."
          >
            <NumberInput
              value={s.news_filter_window_min}
              onChange={(v) => update("news_filter_window_min", v === "" ? 60 : v)}
              min={5} max={240} step={5}
              suffix="min"
              className="max-w-36"
            />
          </FieldRow>
        )}
      </Section>

      {/* ── Sticky save bar ── */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between gap-4 border-t border-border bg-surface-base/90 px-6 py-3 backdrop-blur-sm transition-opacity ${
          dirty || saving ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          {saving && <Loader2 size={14} className="animate-spin text-primary" />}
          {saved && !dirty && <CheckCircle2 size={14} className="text-profit" />}
          {error && <AlertCircle size={14} className="text-loss" />}
          <span>
            {saving ? "Saving…" : saved && !dirty ? "Saved" : error ? error : "Unsaved changes"}
          </span>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
        >
          Save changes
        </button>
      </div>
    </div>
  );
}
