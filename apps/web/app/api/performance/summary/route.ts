/**
 * GET /api/performance/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=…&broker=…&mode=…
 * Metrics panel + equity curve + per-channel table for a range (VCH-PERF-03/04).
 * `to` is exclusive. SQL returns raw components; the tested @vouchfx/core
 * formulas derive the ratios (win %, profit factor, day win %, averages).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseScope, isDateString } from "@/lib/performance";
import { deriveMetrics, deriveChannelRow, cumulativeSeries } from "@vouchfx/core";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = parseScope(searchParams);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!scope || !isDateString(from) || !isDateString(to)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const params = { p_from: from, p_to: to, p_tz: scope.tz, p_broker: scope.broker, p_mode: scope.mode };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const [mRes, sRes, cRes] = await Promise.all([
    db.rpc("fn_perf_metrics", params),
    db.rpc("fn_perf_daily_series", params),
    db.rpc("fn_perf_channels", params),
  ]);
  if (mRes.error || sRes.error || cRes.error) {
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mrow = ((mRes.data ?? [])[0] ?? {}) as any;
  const metrics = deriveMetrics({
    netPnl: Number(mrow.net_pnl ?? 0),
    totalTrades: Number(mrow.total_trades ?? 0),
    winningTrades: Number(mrow.winning_trades ?? 0),
    losingTrades: Number(mrow.losing_trades ?? 0),
    grossProfit: Number(mrow.gross_profit ?? 0),
    grossLoss: Number(mrow.gross_loss ?? 0),
    tradingDays: Number(mrow.trading_days ?? 0),
    greenDays: Number(mrow.green_days ?? 0),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const daily = ((sRes.data ?? []) as any[]).map((r) => ({ day: r.day as string, netPnl: Number(r.net_pnl ?? 0) }));
  const series = cumulativeSeries(daily);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channels = ((cRes.data ?? []) as any[]).map((r) =>
    deriveChannelRow({
      sourceId: r.source_id as string,
      channel: r.channel as string,
      netPnl: Number(r.net_pnl ?? 0),
      totalTrades: Number(r.total_trades ?? 0),
      winningTrades: Number(r.winning_trades ?? 0),
      losingTrades: Number(r.losing_trades ?? 0),
      grossProfit: Number(r.gross_profit ?? 0),
      grossLoss: Number(r.gross_loss ?? 0),
    })
  );

  return NextResponse.json({ metrics, series, channels });
}
