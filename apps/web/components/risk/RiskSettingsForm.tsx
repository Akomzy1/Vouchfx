"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import {
  GitCompareArrows, Scale, CalendarClock, ShieldAlert, ShieldHalf, Activity, Newspaper,
  Copy, Box, SlidersHorizontal, Percent, DollarSign, ShieldOff, ShieldPlus, SkipForward,
  BellRing, PauseCircle, XCircle, TriangleAlert, TrendingDown, Wallet, Info, Check,
  Minus, Plus, Lock, Loader2,
} from "lucide-react";

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
  default_sl_pips_gold:  number | null;
  breakeven_after_tp1:   boolean;
  breakeven_at_1r:       boolean;
  trailing_after_tp2:    boolean;
  news_filter_enabled:   boolean;
  news_filter_window_min: number;
}

// Dollar-per-pip per standard lot — illustrative values for the worked example
const SYMBOLS: Record<string, number> = {
  XAUUSD: 1,
  EURUSD: 10,
  GBPJPY: 6.6,
  US30: 1,
};

const fmt = (n: number, d = 2) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

// ── Primitives (match design prototype) ───────────────────────────────────────

function Toggle({
  on, onChange, label, size = "base",
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  size?: "sm" | "base";
}) {
  const d = size === "sm"
    ? { w: "w-9", h: "h-5", k: "h-3.5 w-3.5", on: "translate-x-[18px]", off: "translate-x-[3px]" }
    : { w: "w-11", h: "h-6", k: "h-[18px] w-[18px]", on: "translate-x-[22px]", off: "translate-x-[3px]" };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative inline-flex ${d.w} ${d.h} shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 ${
        on ? "border-primary bg-primary" : "border-border bg-surface-elevated"
      }`}
    >
      <span
        className={`pointer-events-none inline-block ${d.k} transform rounded-full transition-transform duration-200 ${
          on ? `${d.on} bg-[#04201D]` : `${d.off} bg-text-secondary`
        }`}
      />
    </button>
  );
}

function Segmented<T extends string>({
  options, value, onChange, className = "",
}: {
  options: [T, string, React.ElementType?][];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex rounded-lg border border-border bg-bg/50 p-1 ${className}`} role="radiogroup">
      {options.map(([key, label, Icon]) => {
        const on = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(key)}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              on ? "bg-primary/15 text-primary-light ring-1 ring-primary/30" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {Icon && <Icon size={13} />} {label}
          </button>
        );
      })}
    </div>
  );
}

function NumInput({
  value, onChange, step = 1, min = 0, max = 99999, suffix, prefix, w = "w-28",
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  prefix?: string;
  w?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-1 rounded-lg border border-border bg-bg/50 px-3 ${w} focus-within:border-primary/50`}>
      {prefix && <span className="num text-[14px] font-semibold text-text-muted">{prefix}</span>}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChange(isNaN(v) ? min : Math.min(max, Math.max(min, v)));
        }}
        className="num w-full bg-transparent py-2 text-[15px] font-semibold text-text-primary focus:outline-none"
      />
      {suffix && <span className="num shrink-0 text-[12.5px] text-text-muted">{suffix}</span>}
    </div>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const btn = "flex h-9 w-9 items-center justify-center text-text-secondary transition-colors hover:text-text-primary disabled:opacity-30";
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-bg/50">
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label="Decrease">
        <Minus size={15} />
      </button>
      <span className="num w-11 text-center text-[15px] font-bold text-text-primary">{value}</span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label="Increase">
        <Plus size={15} />
      </button>
    </div>
  );
}

function RadioRow({
  on, onClick, icon: Icon, label, desc, children,
}: {
  on: boolean;
  onClick: () => void;
  icon?: React.ElementType;
  label: string;
  desc?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border transition-colors ${on ? "border-primary/40 bg-primary/[0.07]" : "border-border bg-bg/40 hover:border-text-muted"}`}>
      <button type="button" onClick={onClick} className="flex w-full items-start gap-3 px-3.5 py-3 text-left">
        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-primary" : "border-text-muted"}`}>
          {on && <span className="h-2 w-2 rounded-full bg-primary" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {Icon && <Icon size={14} className={on ? "text-primary-light" : "text-text-muted"} />}
            <span className={`text-[13.5px] font-semibold ${on ? "text-text-primary" : "text-text-secondary"}`}>{label}</span>
          </span>
          {desc && <span className="mt-0.5 block text-[12px] leading-relaxed text-text-muted">{desc}</span>}
        </span>
      </button>
      {on && children && <div className="anim-expand border-t border-border/60 px-3.5 py-3 pl-10">{children}</div>}
    </div>
  );
}

function Section({
  n, icon: Icon, title, desc, children, danger,
}: {
  n: string;
  icon: React.ElementType;
  title: string;
  desc: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border bg-surface ${danger ? "border-warning/30" : "border-border"}`}>
      <div className={`flex items-start gap-3.5 border-b p-5 ${danger ? "border-warning/20 bg-warning/[0.04]" : "border-border/60"}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${danger ? "border-warning/30 bg-warning/10 text-warning" : "border-primary/30 bg-primary/10 text-primary-light"}`}>
          <Icon size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="num text-[11px] font-semibold text-text-muted">{n}</span>
            <h2 className="text-[15.5px] font-bold tracking-tight text-text-primary">{title}</h2>
          </div>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-secondary">{desc}</p>
        </div>
      </div>
      <div className="flex flex-col divide-y divide-border/50 px-5">{children}</div>
    </section>
  );
}

function Field({
  label, helper, children, full,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  if (full) {
    return (
      <div className="py-5 first:pt-5 last:pb-5">
        <div className="mb-3">
          <div className="text-[13.5px] font-semibold text-text-primary">{label}</div>
          {helper && <p className="mt-0.5 text-[12px] leading-relaxed text-text-muted">{helper}</p>}
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 py-5 first:pt-5 last:pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-text-primary">{label}</div>
        {helper && <p className="mt-0.5 max-w-md text-[12px] leading-relaxed text-text-muted">{helper}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

export default function RiskSettingsForm({
  initial, balance, brokerLabel,
}: {
  initial: RiskSettings;
  balance: number | null;
  brokerLabel: string | null;
}) {
  const [s, setS] = useState<RiskSettings>(initial);
  const [saved, setSaved] = useState<RiskSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Worked example local state
  const [exSymbol, setExSymbol] = useState("XAUUSD");
  const [exSlPips, setExSlPips] = useState(20);
  const [ddUnit, setDdUnit] = useState<"pct" | "dollar">("pct");

  const dirty = useMemo(() => JSON.stringify(s) !== JSON.stringify(saved), [s, saved]);

  const set = useCallback((patch: Partial<RiskSettings>) => {
    setS((prev) => ({ ...prev, ...patch }));
  }, []);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Partial<RiskSettings> = {
        ...s,
        max_trades_per_day: s.max_trades_per_day === 0 ? null : s.max_trades_per_day,
        daily_loss_cap_pct: s.daily_loss_cap_pct === 0 ? null : s.daily_loss_cap_pct,
        fixed_lot_size:     s.sizing_mode !== "fixed_lot" ? null : s.fixed_lot_size,
        fixed_usd_risk:     s.sizing_mode !== "fixed_usd_risk" ? null : s.fixed_usd_risk,
        default_sl_pips:      s.default_sl_policy !== "apply_default" ? null : s.default_sl_pips,
        default_sl_pips_gold: s.default_sl_policy !== "apply_default" ? null : s.default_sl_pips_gold,
      };
      const res = await fetch("/api/risk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to save");
      const next = json.settings as RiskSettings;
      setS(next);
      setSaved(next);
      flash("Risk settings saved — applied to all channels on global rules");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [s, flash]);

  const handleDiscard = useCallback(() => setS(saved), [saved]);

  // ── Worked example math ──
  const exBalance = balance ?? 1000;
  const example = useMemo(() => {
    const pip = SYMBOLS[exSymbol] ?? 10;
    const sl = exSlPips || 1;
    let lots: number, risk: number;
    if (s.sizing_mode === "percent_balance") {
      risk = (exBalance * s.risk_per_trade_pct) / 100;
      lots = risk / (sl * pip);
    } else if (s.sizing_mode === "fixed_usd_risk") {
      risk = s.fixed_usd_risk ?? 10;
      lots = risk / (sl * pip);
    } else {
      lots = s.fixed_lot_size ?? 0.01;
      risk = lots * sl * pip;
    }
    return { lots: Math.max(0.01, lots), risk };
  }, [s.sizing_mode, s.risk_per_trade_pct, s.fixed_usd_risk, s.fixed_lot_size, exSymbol, exSlPips, exBalance]);

  const riskPctSlider = ((s.risk_per_trade_pct - 0.1) / (3 - 0.1)) * 100;

  const ddPct = s.daily_loss_cap_pct ?? 0;
  const ddDollars = (exBalance * ddPct) / 100;
  const isMirror = s.execution_mode === "mirror_provider";

  return (
    <div className="flex flex-col gap-4 pb-28">

      {/* ── 01 Execution mode ── */}
      <Section
        n="01"
        icon={GitCompareArrows}
        title="Execution mode"
        desc="The top-level decision: copy the provider's orders verbatim, or filter every signal through your own risk rules."
      >
        <Field label="How VouchFX executes signals" helper="Mirror places the provider's SL/TP exactly as posted; Apply uses your own risk rules." full>
          <Segmented<ExecutionMode>
            value={s.execution_mode}
            onChange={(v) => set({ execution_mode: v })}
            options={[
              ["mirror_provider", "Mirror provider exactly", Copy],
              ["apply_my_rules", "Apply my risk rules", SlidersHorizontal],
            ]}
          />
        </Field>

        {isMirror && (
          <Field label="Lot sizing in mirror mode" helper="Even when mirroring entries and exits, you choose how the position is sized." full>
            <div className="anim-expand flex flex-col gap-2.5">
              <RadioRow on={s.mirror_lot_mode === "provider_lot"} onClick={() => set({ mirror_lot_mode: "provider_lot" })} icon={Copy}
                label="Provider's stated lot" desc="Use the exact lot size posted in the signal. Truest mirror — but ignores your account size." />
              <RadioRow on={s.mirror_lot_mode === "fixed_lot"} onClick={() => set({ mirror_lot_mode: "fixed_lot" })} icon={Box}
                label="Fixed lot" desc="Open every mirrored trade at the fixed lot size set in Position sizing below." />
              <RadioRow on={s.mirror_lot_mode === "risk_based"} onClick={() => set({ mirror_lot_mode: "risk_based" })} icon={Scale}
                label="Risk-based" desc="Mirror the SL/TP, but size the lot from your risk-per-trade rule using the provider's stop." />
            </div>
          </Field>
        )}

        {isMirror && (
          <Field label="Unprotected trades" helper="Mirroring can mean copying trades the provider posted with no stop loss." full>
            <label className={`anim-expand flex cursor-pointer items-start justify-between gap-3 rounded-xl border px-3.5 py-3 transition-colors ${s.mirror_allow_no_sl ? "border-warning/40 bg-warning/[0.06]" : "border-border bg-bg/40"}`}>
              <span className="flex min-w-0 items-start gap-2.5">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${s.mirror_allow_no_sl ? "border-warning/30 bg-warning/10 text-warning" : "border-border bg-surface-elevated text-text-muted"}`}>
                  <ShieldOff size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-text-primary">Allow trades with no stop loss — I understand the risk</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-text-muted">
                    When on, VouchFX will mirror signals that have no SL, leaving those positions unprotected until you close them. The daily loss cap is your only backstop.
                  </span>
                </span>
              </span>
              <Toggle on={s.mirror_allow_no_sl} onChange={(v) => set({ mirror_allow_no_sl: v })} label="Allow trades with no stop loss" />
            </label>
          </Field>
        )}

        <div className="py-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-bg/40 px-3 py-2.5 text-[12px] text-text-secondary">
            <Info size={14} className="shrink-0 text-primary-light" />
            Daily limits and the daily loss cap still apply in both modes.
          </div>
        </div>
      </Section>

      {/* ── 02 Position sizing ── */}
      <Section
        n="02"
        icon={Scale}
        title="Position sizing"
        desc="How VouchFX calculates the lot size for every copied trade, based on the stop loss in each signal."
      >
        <Field label="Risk mode" helper="The basis VouchFX uses to size each position." full>
          <Segmented<SizingMode>
            value={s.sizing_mode}
            onChange={(v) => set({ sizing_mode: v })}
            className="flex-wrap"
            options={[
              ["percent_balance", "% of balance", Percent],
              ["fixed_lot", "Fixed lot", Box],
              ["fixed_usd_risk", "Fixed $ risk", DollarSign],
            ]}
          />
        </Field>

        {s.sizing_mode === "percent_balance" && (
          <Field label="Risk per trade" helper="Share of account equity put at risk on each signal — capped by your stop loss." full>
            <div className="rounded-xl border border-border bg-bg/40 p-4">
              <div className="flex items-baseline justify-between">
                <span className="num text-[28px] font-bold leading-none text-primary-light">{fmt(s.risk_per_trade_pct, 2)}%</span>
                <span className="text-[11.5px] text-text-muted">of equity per signal</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={3}
                step={0.05}
                value={Math.min(3, Math.max(0.1, s.risk_per_trade_pct))}
                onChange={(e) => set({ risk_per_trade_pct: parseFloat(e.target.value) })}
                className="vfx-range mt-3.5"
                style={{ background: `linear-gradient(90deg,#14B8A6 ${riskPctSlider}%,#222B36 ${riskPctSlider}%)` }}
              />
              <div className="num mt-1.5 flex justify-between text-[10px] text-text-muted">
                <span>0.10%</span>
                <span>conservative · aggressive</span>
                <span>3.00%</span>
              </div>
            </div>
          </Field>
        )}

        {s.sizing_mode === "fixed_lot" && (
          <Field label="Fixed lot size" helper="Every trade opens with exactly this lot size, regardless of stop distance.">
            <NumInput value={s.fixed_lot_size ?? 0.1} min={0.01} max={50} step={0.01} suffix="lots" w="w-32"
              onChange={(v) => set({ fixed_lot_size: parseFloat(v.toFixed(2)) })} />
          </Field>
        )}

        {s.sizing_mode === "fixed_usd_risk" && (
          <Field label="Fixed $ risk" helper="VouchFX sizes the lot so the stop loss equals this dollar amount on every trade.">
            <NumInput value={s.fixed_usd_risk ?? 10} min={1} max={5000} step={1} prefix="$" w="w-32"
              onChange={(v) => set({ fixed_usd_risk: v })} />
          </Field>
        )}

        {/* Live worked example */}
        <Field label="Live worked example" helper="A real-time preview using your connected balance. Adjust the example stop and symbol to sanity-check sizing." full>
          <div className="rounded-xl border border-primary/25 bg-primary/[0.05] p-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <div className="flex items-center gap-2 text-[12px] text-text-secondary">
                <Wallet size={14} className="text-primary-light" /> Balance
                <span className="num font-semibold text-text-primary">${fmt(exBalance)}</span>
                <span className="num rounded border border-border bg-bg/50 px-1.5 py-px text-[10px] text-text-muted">
                  {balance != null ? `${brokerLabel ?? "Broker"} · MT5` : "example"}
                </span>
              </div>
              <label className="flex items-center gap-2 text-[12px] text-text-secondary">
                SL
                <NumInput value={exSlPips} min={1} max={500} step={1} suffix="pips" w="w-24" onChange={setExSlPips} />
              </label>
              <label className="flex items-center gap-2 text-[12px] text-text-secondary">
                Symbol
                <select
                  value={exSymbol}
                  onChange={(e) => setExSymbol(e.target.value)}
                  className="num rounded-lg border border-border bg-bg/50 py-2 pl-3 pr-8 text-[13px] font-semibold text-text-primary focus:border-primary/50 focus:outline-none"
                >
                  {Object.keys(SYMBOLS).map((k) => (
                    <option key={k} value={k} className="bg-surface">{k}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-primary/20 pt-4">
              <p className="max-w-md text-[13px] leading-relaxed text-text-secondary">
                {s.sizing_mode === "fixed_lot" ? (
                  <>A fixed <span className="num font-semibold text-text-primary">{fmt(s.fixed_lot_size ?? 0.1)}</span> lot on a{" "}
                    <span className="num font-semibold text-text-primary">{exSlPips}-pip</span> {exSymbol} SL risks about</>
                ) : (
                  <>On your <span className="num font-semibold text-text-primary">${fmt(exBalance)}</span> balance{" "}
                    {s.sizing_mode === "percent_balance"
                      ? <>at <span className="num font-semibold text-text-primary">{fmt(s.risk_per_trade_pct)}%</span></>
                      : <>risking <span className="num font-semibold text-text-primary">${fmt(s.fixed_usd_risk ?? 10)}</span></>}
                    , a <span className="num font-semibold text-text-primary">{exSlPips}-pip</span> {exSymbol} SL ≈</>
                )}
              </p>
              <div className="flex items-center gap-4">
                {s.sizing_mode !== "fixed_lot" && (
                  <div className="text-right">
                    <div className="num text-[24px] font-bold leading-none text-primary-light">{fmt(example.lots)}</div>
                    <div className="text-[10.5px] text-text-muted">lots</div>
                  </div>
                )}
                <div className="text-right">
                  <div className="num text-[24px] font-bold leading-none text-text-primary">${fmt(example.risk)}</div>
                  <div className="text-[10.5px] text-text-muted">{s.sizing_mode === "fixed_lot" ? `${fmt(example.lots)} lots · at risk` : "at risk"}</div>
                </div>
              </div>
            </div>
          </div>
        </Field>
      </Section>

      {/* ── 03 Daily limits ── */}
      <Section
        n="03"
        icon={CalendarClock}
        title="Daily limits"
        desc="Caps that reset every trading day — protect against signal spam and over-trading."
      >
        <Field label="Max trades per day" helper="Hard ceiling on positions VouchFX will open in a single day. 0 = unlimited.">
          <Stepper value={s.max_trades_per_day ?? 0} min={0} max={50} onChange={(v) => set({ max_trades_per_day: v === 0 ? null : v })} />
        </Field>
        <Field label="Daily signal limit" helper="VouchFX will act on at most this many signals per day, then skip the rest. 0 = unlimited.">
          <Stepper value={s.daily_signal_limit} min={0} max={50} onChange={(v) => set({ daily_signal_limit: v })} />
        </Field>
        <Field label="Day rollover time" helper="When the daily counters reset.">
          <span className="num inline-flex items-center gap-2 rounded-lg border border-border bg-bg/50 px-3 py-2.5 text-[13px] font-semibold text-text-secondary">
            <CalendarClock size={14} className="text-text-muted" /> 00:00 — Midnight (UTC)
          </span>
        </Field>
      </Section>

      {/* ── 04 Drawdown protection ── */}
      <Section
        n="04"
        icon={ShieldAlert}
        title="Drawdown protection"
        danger
        desc="Your circuit breaker. If the account loses too much in one day, VouchFX stops trading automatically."
      >
        <Field label="Max daily loss" helper="The most VouchFX will let the account lose in a day before it intervenes. 0 = disabled." full>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented<"pct" | "dollar">
              value={ddUnit}
              onChange={setDdUnit}
              options={[["pct", "% of balance"], ["dollar", "$ amount"]]}
            />
            {ddUnit === "pct" ? (
              <NumInput value={ddPct} min={0} max={50} step={0.5} suffix="%" w="w-28"
                onChange={(v) => set({ daily_loss_cap_pct: v === 0 ? null : v })} />
            ) : (
              <NumInput value={Math.round(ddDollars)} min={0} max={1000000} step={1} prefix="$" w="w-32"
                onChange={(v) => set({ daily_loss_cap_pct: v === 0 ? null : parseFloat(((v / exBalance) * 100).toFixed(2)) })} />
            )}
            {ddPct > 0 && (
              <span className="num inline-flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/[0.07] px-3 py-2 text-[12px] text-warning">
                <TrendingDown size={13} />
                {ddUnit === "pct" ? <>≈ ${fmt(ddDollars)} of ${fmt(exBalance)}</> : <>≈ {fmt(ddPct)}% of balance</>}
              </span>
            )}
          </div>
        </Field>

        <Field label="On breach" helper="What VouchFX does the moment the daily loss limit is hit." full>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/[0.06] px-3.5 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary-light">
                <PauseCircle size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
                  Pause copying
                  <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0 text-[10px] font-medium text-primary-light">Always on</span>
                </div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-text-muted">
                  No new signals are copied for the rest of the day. Copying resumes automatically at rollover (00:00 UTC).
                </p>
              </div>
              <Check size={18} className="shrink-0 text-primary-light" strokeWidth={2.4} />
            </div>

            <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-border bg-bg/40 px-3.5 py-3">
              <span className="flex min-w-0 items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated text-loss">
                  <XCircle size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-text-primary">Also close all open trades</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-text-muted">
                    Immediately flatten every open position at market when the limit breaks — locks in the day&rsquo;s loss and removes all exposure.
                  </span>
                </span>
              </span>
              <Toggle
                on={s.daily_loss_cap_action === "pause_and_close"}
                onChange={(v) => set({ daily_loss_cap_action: v ? "pause_and_close" : "pause" })}
                label="Close all on breach"
              />
            </label>

            {s.daily_loss_cap_action === "pause_and_close" && (
              <div className="num anim-expand flex items-center gap-1.5 rounded-lg border border-loss/30 bg-loss/[0.07] px-3 py-2 text-[11.5px] text-loss">
                <TriangleAlert size={13} /> Open positions will be force-closed at market on breach — slippage may apply.
              </div>
            )}
          </div>
        </Field>
      </Section>

      {/* ── 05 Stop-loss handling ── */}
      <Section
        n="05"
        icon={ShieldHalf}
        title="Stop-loss handling"
        desc="What VouchFX does when a signal arrives without a stop loss — the single biggest source of uncontrolled risk."
      >
        <Field label="When a signal has no SL" full>
          <div className="flex flex-col gap-2.5">
            <RadioRow on={s.default_sl_policy === "apply_default"} onClick={() => set({ default_sl_policy: "apply_default" })} icon={ShieldPlus}
              label="Apply a default stop loss" desc="Attach a fixed stop at this distance so the trade is never left unprotected.">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <label className="flex items-center gap-2.5 text-[12px] text-text-secondary">
                  Forex / general
                  <NumInput value={s.default_sl_pips ?? 30} min={1} max={500} step={1} suffix="pips" w="w-24"
                    onChange={(v) => set({ default_sl_pips: v })} />
                </label>
                <label className="flex items-center gap-2.5 text-[12px] text-text-secondary">
                  Gold (XAU)
                  <NumInput value={s.default_sl_pips_gold ?? 150} min={1} max={2000} step={5} suffix="pips" w="w-24"
                    onChange={(v) => set({ default_sl_pips_gold: v })} />
                </label>
              </div>
            </RadioRow>
            <RadioRow on={s.default_sl_policy === "skip"} onClick={() => set({ default_sl_policy: "skip" })} icon={SkipForward}
              label="Skip the signal" desc="Don't trade signals that arrive without a stop loss. Safest option." />
            <RadioRow on={s.default_sl_policy === "ask"} onClick={() => set({ default_sl_policy: "ask" })} icon={BellRing}
              label="Ask me" desc="Send a push notification and hold the trade until you confirm or dismiss it. (Coming in a later phase — treated as Skip for now.)" />
          </div>
        </Field>
      </Section>

      {/* ── 06 Trade management ── */}
      <Section
        n="06"
        icon={Activity}
        title="Trade management"
        desc="Automatic stop adjustments as a position moves through its take-profit targets."
      >
        <Field label="Breakeven after TP1" helper="Move the stop loss to entry once the first take-profit is hit — turns a winner into a risk-free runner.">
          <Toggle on={s.breakeven_after_tp1} onChange={(v) => set({ breakeven_after_tp1: v })} label="Breakeven after TP1" />
        </Field>
        <Field label="Breakeven at 1R" helper="Move the stop loss to entry once price is in profit by the stop-loss distance (1:1). Works on any trade with a stop — no take-profit needed.">
          <Toggle on={s.breakeven_at_1r} onChange={(v) => set({ breakeven_at_1r: v })} label="Breakeven at 1R" />
        </Field>
        <Field label="Trailing stop after TP2" helper="Trail the stop behind price once TP2 is reached, locking in gains as the move extends. (Execution in next phase.)">
          <Toggle on={s.trailing_after_tp2} onChange={(v) => set({ trailing_after_tp2: v })} label="Trailing stop after TP2" />
        </Field>
      </Section>

      {/* ── 07 News filter ── */}
      <Section
        n="07"
        icon={Newspaper}
        title="News filter"
        desc="Pause copying around high-impact economic events, when spreads widen and price gaps are common."
      >
        <Field label="Avoid high-impact news" helper="Skip signals that land inside the window around red-folder calendar events (NFP, CPI, rate decisions).">
          <Toggle on={s.news_filter_enabled} onChange={(v) => set({ news_filter_enabled: v })} label="News filter" />
        </Field>
        {s.news_filter_enabled && (
          <Field label="Blackout window" helper="How long before and after each event VouchFX stops copying. Applied symmetrically." full>
            <div className="anim-expand">
              <label className="flex items-center gap-2.5 text-[12px] text-text-secondary">
                Before &amp; after each event
                <NumInput value={s.news_filter_window_min} min={5} max={240} step={5} suffix="min" w="w-28"
                  onChange={(v) => set({ news_filter_window_min: v })} />
              </label>
            </div>
          </Field>
        )}
      </Section>

      <div className="num flex items-center justify-center gap-1.5 py-1 text-[11px] text-text-muted">
        <Lock size={12} /> Changes apply on save · individual channels can override these in Channels
      </div>

      {/* ── Save bar ── */}
      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-40 border-t border-border bg-bg/90 backdrop-blur lg:bottom-0 lg:left-[236px]">
        <div className="mx-auto flex w-full max-w-[920px] items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-[12.5px]">
            {error ? (
              <><TriangleAlert size={14} className="text-loss" /><span className="font-medium text-loss truncate">{error}</span></>
            ) : dirty ? (
              <>
                <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                <span className="font-medium text-warning">Unsaved changes</span>
                <span className="hidden text-text-muted sm:inline">— applies to all channels using global rules</span>
              </>
            ) : (
              <>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary-light">
                  <Check size={12} strokeWidth={2.5} />
                </span>
                <span className="font-medium text-text-secondary">All changes saved</span>
              </>
            )}
          </div>
          <button
            onClick={handleDiscard}
            disabled={!dirty || saving}
            className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Discard
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-[#04201D] transition-colors hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.5} />}
            Save changes
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="anim-fade fixed bottom-32 left-1/2 z-[80] -translate-x-1/2 lg:bottom-20">
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
