/**
 * Periodic deal-history sync — realised P&L per trade (VCH-DSH-03, Performance).
 *
 * MetaApi deal history is the only source of truth for realised P&L: closes we
 * perform (CLOSE_ALL, drawdown cap, kill-switch) don't return profit, and
 * closes the BROKER performs (TP/SL hit, stop-out) were previously invisible —
 * trades lingered OPEN in the DB forever and trade_events was never written,
 * so the Performance analytics had nothing to sum.
 *
 * Every interval, for each active broker connection:
 *   1. Fetch deals for the lookback window (overlap-safe — trade_events.deal_id
 *      is unique per trade, so re-seen deals are no-ops).
 *   2. Match closing deals to trades by broker_order_id (= MetaApi positionId)
 *      on that connection.
 *   3. Insert one trade_events row per closing deal with the net account-
 *      currency P&L (profit + commission + swap).
 *   4. When the deals cover the trade's full volume, reconcile a still-OPEN
 *      trade to CLOSED with the final deal's timestamp.
 */
import type { TypedClient } from "@vouchfx/db";
import type { MetaApiExecutor } from "@vouchfx/core/executor";
import type { BrokerConnection } from "@vouchfx/core";
import type { Logger } from "@vouchfx/core";
import { extractCloseDeals, reconcileTradeCloses } from "@vouchfx/core";

interface BrokerRow {
  id: string;
  user_id: string;
  metaapi_account_id: string | null;
  platform: "MT5" | "MT4";
}

interface TradeRow {
  id: string;
  user_id: string;
  volume: number;
  status: string;
  broker_order_id: string | null;
}

/** Deal lookback per run. Idempotent on deal_id, so a generous overlap is safe
 *  and covers executor downtime/restarts. */
const LOOKBACK_MS = 72 * 60 * 60 * 1000;

export async function syncTradeCloses(
  db: TypedClient,
  executor: MetaApiExecutor,
  log?: Logger
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("broker_connections")
    .select("id, user_id, metaapi_account_id, platform")
    .eq("is_active", true);

  if (error) {
    log?.error("trade sync: query failed", { error: error.message });
    return 0;
  }

  let recorded = 0;
  for (const row of (data ?? []) as BrokerRow[]) {
    if (!row.metaapi_account_id) continue;
    const conn: BrokerConnection = {
      id: row.id,
      userId: row.user_id,
      metaApiAccountId: row.metaapi_account_id,
      platform: row.platform,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rawDeals: any[];
    try {
      rawDeals = await executor.getDeals(conn, new Date(Date.now() - LOOKBACK_MS));
    } catch (err) {
      // History unavailable (account offline/limited) — others must still sync.
      log?.warn?.("trade sync: deal fetch failed", { brokerId: row.id, error: (err as Error).message });
      continue;
    }

    const closes = extractCloseDeals(rawDeals);
    if (closes.length === 0) continue;

    // Trades on THIS connection whose broker position produced these deals.
    const positionIds = [...new Set(closes.map((c) => c.positionId))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tradeRows } = await (db as any)
      .from("trades")
      .select("id, user_id, volume, status, broker_order_id")
      .eq("broker_connection_id", row.id)
      .in("broker_order_id", positionIds);

    const byPosition = new Map<string, TradeRow>();
    for (const t of (tradeRows ?? []) as TradeRow[]) {
      if (t.broker_order_id) byPosition.set(t.broker_order_id, t);
    }
    if (byPosition.size === 0) continue;

    // Group closing deals per trade and reconcile.
    for (const [positionId, trade] of byPosition) {
      const tradeDeals = closes.filter((c) => c.positionId === positionId);
      const rec = reconcileTradeCloses(Number(trade.volume), tradeDeals);
      if (rec.events.length === 0) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: evErr } = await (db as any).from("trade_events").upsert(
        rec.events.map((e) => ({
          trade_id: trade.id,
          user_id: trade.user_id,
          event_type: e.eventType,
          price: e.price,
          volume: e.volume,
          pnl: e.pnl,
          deal_id: e.dealId,
          payload: { position_id: positionId, source: "deal_sync" },
        })),
        { onConflict: "trade_id,deal_id", ignoreDuplicates: true }
      );
      if (evErr) {
        log?.warn?.("trade sync: event insert failed", { tradeId: trade.id, error: evErr.message });
        continue;
      }
      recorded += rec.events.length;

      // Broker closed the position (TP/SL/stop-out) but the DB still shows it
      // live — reconcile. Explicit closes already set CLOSED; leave them alone.
      if (rec.fullyClosed && (trade.status === "OPEN" || trade.status === "PENDING")) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from("trades")
          .update({ status: "CLOSED", closed_at: rec.closedAt })
          .eq("id", trade.id);
        log?.info("trade sync: reconciled broker-side close", { tradeId: trade.id, closedAt: rec.closedAt });
      }
    }
  }

  if (recorded > 0) log?.info("trade sync complete", { events: recorded });
  return recorded;
}

/** Record realised P&L from deal history every `intervalMs` (default 3 min) + a boot tick. */
export function startTradeSync(
  db: TypedClient,
  executor: MetaApiExecutor,
  log?: Logger,
  intervalMs = 3 * 60_000
): () => void {
  const run = () =>
    syncTradeCloses(db, executor, log).catch((err) =>
      log?.error("trade sync failed", { error: (err as Error).message })
    );
  const boot = setTimeout(run, 25_000);
  const timer = setInterval(run, intervalMs);
  return () => {
    clearTimeout(boot);
    clearInterval(timer);
  };
}
