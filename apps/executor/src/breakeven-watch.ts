/**
 * Periodic breakeven-at-1R watch (VCH-RSK-05 extension).
 *
 * For users with risk_settings.breakeven_at_1r enabled: once an OPEN trade is
 * in profit by at least its own SL distance (1R), move the stop to the entry
 * price and mark breakeven_applied. The decision is pure core logic
 * (shouldMoveToBreakeven); this module feeds it live prices on a timer —
 * unlike breakeven-after-TP1 there is no broker event to piggyback on, the
 * trigger is price itself.
 *
 * One getPositions RPC per broker connection per tick (not per trade). A trade
 * whose position no longer exists broker-side is left alone — the trade-sync
 * reconciler owns closing those out.
 */
import type { TypedClient } from "@vouchfx/db";
import type { MetaApiExecutor } from "@vouchfx/core/executor";
import type { BrokerConnection, Logger } from "@vouchfx/core";
import { shouldMoveToBreakeven } from "@vouchfx/core";

interface TradeRow {
  id: string;
  user_id: string;
  parsed_signal_id: string;
  broker_connection_id: string;
  side: "BUY" | "SELL";
  entry_price: number;
  sl: number;
  broker_order_id: string;
}

interface BrokerRow {
  id: string;
  user_id: string;
  metaapi_account_id: string | null;
  platform: "MT5" | "MT4";
}

export async function applyBreakevenAt1R(
  db: TypedClient,
  executor: MetaApiExecutor,
  log?: Logger
): Promise<number> {
  // Users who opted in. The toggle lives on risk_settings (global per user).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: optedIn, error: rsErr } = await (db as any)
    .from("risk_settings")
    .select("user_id")
    .eq("breakeven_at_1r", true);

  if (rsErr) {
    log?.error("breakeven watch: settings query failed", { error: rsErr.message });
    return 0;
  }
  const userIds = ((optedIn ?? []) as { user_id: string }[]).map((r) => r.user_id);
  if (userIds.length === 0) return 0;

  // Candidate legs: open, stop still at risk, position known broker-side.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tradeRows, error: tErr } = await (db as any)
    .from("trades")
    .select("id, user_id, parsed_signal_id, broker_connection_id, side, entry_price, sl, broker_order_id")
    .in("user_id", userIds)
    .eq("status", "OPEN")
    .eq("breakeven_applied", false)
    .not("sl", "is", null)
    .not("entry_price", "is", null)
    .not("broker_order_id", "is", null);

  if (tErr) {
    log?.error("breakeven watch: trades query failed", { error: tErr.message });
    return 0;
  }
  const trades = (tradeRows ?? []) as TradeRow[];
  if (trades.length === 0) return 0;

  const connIds = [...new Set(trades.map((t) => t.broker_connection_id))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: brokerRows } = await (db as any)
    .from("broker_connections")
    .select("id, user_id, metaapi_account_id, platform")
    .in("id", connIds)
    .eq("is_active", true);

  let moved = 0;

  for (const row of ((brokerRows ?? []) as BrokerRow[])) {
    if (!row.metaapi_account_id) continue;
    const conn: BrokerConnection = {
      id: row.id,
      userId: row.user_id,
      metaApiAccountId: row.metaapi_account_id,
      platform: row.platform,
    };

    let positions;
    try {
      positions = await executor.getOpenPositions(conn);
    } catch (err) {
      // Account offline/desynced — others must still be checked.
      log?.warn?.("breakeven watch: positions fetch failed", { brokerId: row.id, error: (err as Error).message });
      continue;
    }
    const byId = new Map(positions.map((p) => [p.brokerId, p]));

    for (const trade of trades.filter((t) => t.broker_connection_id === row.id)) {
      const pos = byId.get(trade.broker_order_id);
      if (!pos || !(pos.currentPrice > 0)) continue;

      const eligible = shouldMoveToBreakeven({
        side: trade.side,
        entryPrice: Number(trade.entry_price),
        sl: Number(trade.sl),
        currentPrice: pos.currentPrice,
      });
      if (!eligible) continue;

      try {
        await executor.modifyOrder(
          { connectionId: row.id, brokerId: trade.broker_order_id },
          { sl: Number(trade.entry_price) }
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from("trades")
          .update({ sl: trade.entry_price, breakeven_applied: true })
          .eq("id", trade.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).from("audit_events").insert({
          user_id: trade.user_id,
          parsed_signal_id: trade.parsed_signal_id,
          trade_id: trade.id,
          event_type: "modified",
          payload: {
            action: "breakeven_1r_applied",
            entry_price: trade.entry_price,
            prev_sl: trade.sl,
            trigger_price: pos.currentPrice,
          },
        });
        moved++;
        log?.info("breakeven watch: SL moved to entry (1R reached)", {
          tradeId: trade.id,
          entry: trade.entry_price,
          prevSl: trade.sl,
          price: pos.currentPrice,
        });
      } catch (err) {
        log?.warn?.("breakeven watch: modify failed", { tradeId: trade.id, error: (err as Error).message });
      }
    }
  }

  return moved;
}

/** Check every `intervalMs` (default 60s) + a boot tick after connections warm. */
export function startBreakevenWatch(
  db: TypedClient,
  executor: MetaApiExecutor,
  log?: Logger,
  intervalMs = 60_000
): () => void {
  const run = () =>
    applyBreakevenAt1R(db, executor, log).catch((err) =>
      log?.error("breakeven watch failed", { error: (err as Error).message })
    );
  const boot = setTimeout(run, 40_000);
  const timer = setInterval(run, intervalMs);
  return () => {
    clearTimeout(boot);
    clearInterval(timer);
  };
}
