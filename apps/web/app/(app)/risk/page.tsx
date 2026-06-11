import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import RiskSettingsForm, { type RiskSettings } from "@/components/risk/RiskSettingsForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Risk Settings" };
export const dynamic = "force-dynamic";

const DEFAULTS: RiskSettings = {
  execution_mode:        "apply_my_rules",
  mirror_lot_mode:       "risk_based",
  mirror_allow_no_sl:    false,
  sizing_mode:           "percent_balance",
  risk_per_trade_pct:    0.5,
  fixed_lot_size:        null,
  fixed_usd_risk:        null,
  daily_signal_limit:    0,
  max_trades_per_day:    null,
  daily_loss_cap_pct:    null,
  daily_loss_cap_action: "pause",
  default_sl_policy:     "skip",
  default_sl_pips:       null,
  breakeven_after_tp1:   false,
  trailing_after_tp2:    false,
  news_filter_enabled:   false,
  news_filter_window_min: 60,
};

export default async function RiskPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("risk_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const initial: RiskSettings = data
    ? {
        execution_mode:        data.execution_mode        ?? DEFAULTS.execution_mode,
        mirror_lot_mode:       data.mirror_lot_mode       ?? DEFAULTS.mirror_lot_mode,
        mirror_allow_no_sl:    data.mirror_allow_no_sl    ?? false,
        sizing_mode:           data.sizing_mode           ?? DEFAULTS.sizing_mode,
        risk_per_trade_pct:    data.risk_per_trade_pct    ?? DEFAULTS.risk_per_trade_pct,
        fixed_lot_size:        data.fixed_lot_size        ?? null,
        fixed_usd_risk:        data.fixed_usd_risk        ?? null,
        daily_signal_limit:    data.daily_signal_limit    ?? 0,
        max_trades_per_day:    data.max_trades_per_day    ?? null,
        daily_loss_cap_pct:    data.daily_loss_cap_pct    ?? null,
        daily_loss_cap_action: data.daily_loss_cap_action ?? DEFAULTS.daily_loss_cap_action,
        default_sl_policy:     data.default_sl_policy     ?? DEFAULTS.default_sl_policy,
        default_sl_pips:       data.default_sl_pips       ?? null,
        breakeven_after_tp1:   data.breakeven_after_tp1   ?? false,
        trailing_after_tp2:    data.trailing_after_tp2    ?? false,
        news_filter_enabled:   data.news_filter_enabled   ?? false,
        news_filter_window_min: data.news_filter_window_min ?? 60,
      }
    : DEFAULTS;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Risk Settings</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Position sizing, daily limits, and drawdown protection. Changes apply to new signals only.
        </p>
      </div>

      <RiskSettingsForm initial={initial} />
    </div>
  );
}
