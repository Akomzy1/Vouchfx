/**
 * GET  /api/risk — fetch (or create with defaults) the user's risk settings row
 * PATCH /api/risk — update risk settings (partial)
 *
 * Uses RLS via authenticated user session.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SIZING_MODES      = ["percent_balance", "fixed_lot", "fixed_usd_risk"] as const;
const SL_POLICIES       = ["apply_default", "skip", "ask"] as const;
const LOSS_ACTIONS      = ["pause", "pause_and_close"] as const;
const EXECUTION_MODES   = ["apply_my_rules", "mirror_provider"] as const;
const MIRROR_LOT_MODES  = ["provider_lot", "fixed_lot", "risk_based"] as const;

type PatchBody = {
  sizing_mode?:           string;
  risk_per_trade_pct?:    unknown;
  fixed_lot_size?:        unknown;
  fixed_usd_risk?:        unknown;
  daily_signal_limit?:    unknown;
  max_trades_per_day?:    unknown;
  daily_loss_cap_pct?:    unknown;
  daily_loss_cap_action?: string;
  default_sl_policy?:     string;
  default_sl_pips?:       unknown;
  default_sl_pips_gold?:  unknown;
  breakeven_after_tp1?:   unknown;
  trailing_after_tp2?:    unknown;
  execution_mode?:        string;
  mirror_lot_mode?:       string;
  mirror_allow_no_sl?:    unknown;
  news_filter_enabled?:   unknown;
  news_filter_window_min?: unknown;
};

function validatePatch(body: PatchBody): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const d: Record<string, unknown> = {};
  if (body.sizing_mode !== undefined) {
    if (!SIZING_MODES.includes(body.sizing_mode as never)) return { ok: false, error: "Invalid sizing_mode" };
    d.sizing_mode = body.sizing_mode;
  }
  if (body.default_sl_policy !== undefined) {
    if (!SL_POLICIES.includes(body.default_sl_policy as never)) return { ok: false, error: "Invalid default_sl_policy" };
    d.default_sl_policy = body.default_sl_policy;
  }
  if (body.daily_loss_cap_action !== undefined) {
    if (!LOSS_ACTIONS.includes(body.daily_loss_cap_action as never)) return { ok: false, error: "Invalid daily_loss_cap_action" };
    d.daily_loss_cap_action = body.daily_loss_cap_action;
  }
  if (body.execution_mode !== undefined) {
    if (!EXECUTION_MODES.includes(body.execution_mode as never)) return { ok: false, error: "Invalid execution_mode" };
    d.execution_mode = body.execution_mode;
  }
  if (body.mirror_lot_mode !== undefined) {
    if (!MIRROR_LOT_MODES.includes(body.mirror_lot_mode as never)) return { ok: false, error: "Invalid mirror_lot_mode" };
    d.mirror_lot_mode = body.mirror_lot_mode;
  }
  for (const key of ["risk_per_trade_pct", "fixed_lot_size", "fixed_usd_risk", "daily_signal_limit", "max_trades_per_day", "daily_loss_cap_pct", "default_sl_pips", "default_sl_pips_gold"] as const) {
    if (key in body) {
      const v = body[key];
      if (v !== null && typeof v !== "number") return { ok: false, error: `${key} must be a number or null` };
      d[key] = v;
    }
  }
  for (const key of ["breakeven_after_tp1", "trailing_after_tp2", "mirror_allow_no_sl", "news_filter_enabled"] as const) {
    if (key in body) {
      if (typeof body[key] !== "boolean") return { ok: false, error: `${key} must be a boolean` };
      d[key] = body[key];
    }
  }
  if ("news_filter_window_min" in body) {
    const v = body.news_filter_window_min;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 5 || v > 240) {
      return { ok: false, error: "news_filter_window_min must be an integer 5–240" };
    }
    d.news_filter_window_min = v;
  }
  return { ok: true, data: d };
}

const DEFAULTS = {
  sizing_mode:           "percent_balance" as const,
  risk_per_trade_pct:    0.5,
  fixed_lot_size:        null,
  fixed_usd_risk:        null,
  daily_signal_limit:    0,
  max_trades_per_day:    null,
  daily_loss_cap_pct:    null,
  daily_loss_cap_action: "pause" as const,
  default_sl_policy:     "skip" as const,
  default_sl_pips:       null,
  default_sl_pips_gold:  150,
  breakeven_after_tp1:   false,
  trailing_after_tp2:    false,
  execution_mode:        "apply_my_rules" as const,
  mirror_lot_mode:       "risk_based" as const,
  mirror_allow_no_sl:    false,
  news_filter_enabled:   false,
  news_filter_window_min: 60,
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const initial = await db
    .from("risk_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  let data = initial.data;

  if (initial.error) return NextResponse.json({ error: initial.error.message }, { status: 500 });

  // First visit — create defaults row
  if (!data) {
    const { data: inserted, error: insertError } = await db
      .from("risk_settings")
      .insert({ user_id: user.id, ...DEFAULTS })
      .select("*")
      .single();
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    data = inserted;
  }

  return NextResponse.json({ settings: data });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = validatePatch(body as PatchBody);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Upsert — handles the first-visit case where no row exists yet
  const { data, error } = await db
    .from("risk_settings")
    .upsert(
      { user_id: user.id, ...DEFAULTS, ...result.data },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}
