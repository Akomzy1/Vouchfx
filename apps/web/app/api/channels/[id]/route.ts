/**
 * PATCH  /api/channels/[id] — update a signal source
 * DELETE /api/channels/[id] — remove a signal source (pause & keep trades)
 * POST   /api/channels/[id] — kill-close: soft-disable + flag for executor to close all trades
 *
 * Uses RLS — the user can only modify their own sources.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

type PatchBody = {
  is_enabled?: boolean;
  daily_signal_limit?: number | null;
  promote_to_live?: boolean;
  override_risk_enabled?: boolean;
  override_risk_pct?: number | null;
  kill_close_requested_at?: string | null;
};

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.is_enabled === "boolean") updates.is_enabled = body.is_enabled;
  if ("daily_signal_limit" in body) updates.daily_signal_limit = body.daily_signal_limit ?? null;
  if (body.promote_to_live === true) updates.demo_until = null;
  if (typeof body.override_risk_enabled === "boolean") {
    updates.override_risk_enabled = body.override_risk_enabled;
  }
  if ("override_risk_pct" in body) {
    const v = body.override_risk_pct;
    if (v !== null && (typeof v !== "number" || v <= 0 || v > 100)) {
      return NextResponse.json({ error: "override_risk_pct must be > 0 and ≤ 100" }, { status: 422 });
    }
    updates.override_risk_pct = v ?? null;
  }
  if ("kill_close_requested_at" in body) {
    updates.kill_close_requested_at = body.kill_close_requested_at ?? null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("signal_sources")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, telegram_chat_id, title, is_enabled, daily_signal_limit, demo_until, override_risk_enabled, override_risk_pct, kill_close_requested_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ source: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("signal_sources")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}

/**
 * POST /api/channels/[id]
 * Kill-close: soft-disables the channel and sets kill_close_requested_at so the
 * executor's heartbeat poller will close all open/pending trades from this source,
 * then hard-delete the row. The UI can optimistically remove it from local state.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("signal_sources")
    .update({ is_enabled: false, kill_close_requested_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
