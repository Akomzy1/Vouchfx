/**
 * GET /api/performance/day?day=YYYY-MM-DD&tz=…&broker=…&mode=…
 * Trades CLOSED on one day, in the display tz (VCH-PERF-02). Reconciles exactly
 * with that day's calendar cell (same fn_perf source, same scope).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseScope, isDateString } from "@/lib/performance";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = parseScope(searchParams);
  const day = searchParams.get("day");
  if (!scope || !isDateString(day)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db.rpc("fn_perf_day_trades", {
    p_day: day,
    p_tz: scope.tz,
    p_broker: scope.broker,
    p_mode: scope.mode,
  });
  if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trades = ((data ?? []) as any[]).map((r) => ({
    tradeId: r.trade_id as string,
    signalId: r.signal_id as string,
    symbol: r.symbol as string,
    side: r.side as string,
    volume: Number(r.volume ?? 0),
    entryPrice: r.entry_price != null ? Number(r.entry_price) : null,
    exitPrice: r.exit_price != null ? Number(r.exit_price) : null,
    pnl: Number(r.pnl ?? 0),
    channel: r.channel as string,
    closedAt: r.closed_at as string,
  }));
  return NextResponse.json({ trades });
}
