/**
 * GET /api/performance/calendar?month=YYYY-MM-01&tz=…&broker=…&mode=…
 * Per-day realised-P&L aggregates for one month (VCH-PERF-01). SQL does the
 * aggregation (fn_perf_calendar) under the caller's RLS.
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
  const month = searchParams.get("month");
  if (!scope || !isDateString(month)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db.rpc("fn_perf_calendar", {
    p_month_start: month,
    p_tz: scope.tz,
    p_broker: scope.broker,
    p_mode: scope.mode,
  });
  if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const days = ((data ?? []) as any[]).map((r) => ({
    day: r.day as string,
    netPnl: Number(r.net_pnl ?? 0),
    tradeCount: Number(r.trade_count ?? 0),
    winCount: Number(r.win_count ?? 0),
  }));
  return NextResponse.json({ days });
}
