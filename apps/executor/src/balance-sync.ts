/**
 * Periodic broker balance sync.
 *
 * The dashboard reads broker_connections.last_balance_usd / last_equity_usd,
 * which the worker only refreshes WHILE processing a signal. Between signals
 * (and after a trade closes with realised P&L) that cache goes stale. This job
 * polls MetaApi for every active broker on an interval and refreshes the cache
 * so the dashboard reflects the real account between signals.
 */
import type { TypedClient } from "@vouchfx/db";
import type { MetaApiExecutor } from "@vouchfx/core/executor";
import type { BrokerConnection } from "@vouchfx/core";
import type { Logger } from "@vouchfx/core";

interface BrokerRow {
  id: string;
  user_id: string;
  metaapi_account_id: string | null;
  platform: "MT5" | "MT4";
}

export async function syncBrokerBalances(
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
    log?.error("balance sync: query failed", { error: error.message });
    return 0;
  }

  let synced = 0;
  for (const row of (data ?? []) as BrokerRow[]) {
    if (!row.metaapi_account_id) continue;
    const conn: BrokerConnection = {
      id: row.id,
      userId: row.user_id,
      metaApiAccountId: row.metaapi_account_id,
      platform: row.platform,
    };
    try {
      const { balance, equity, accountMode } = await executor.getAccountInfo(conn);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .from("broker_connections")
        .update({
          last_balance_usd: balance,
          last_equity_usd: equity,
          last_synced_at: new Date().toISOString(),
          ...(accountMode ? { account_mode: accountMode } : {}),
        })
        .eq("id", row.id);
      synced += 1;
    } catch (err) {
      // One broker failing (offline/creds) must not stop the others.
      log?.warn?.("balance sync: broker refresh failed", { brokerId: row.id, error: (err as Error).message });
    }
  }
  if (synced > 0) log?.info("balance sync complete", { brokers: synced });
  return synced;
}

/** Refresh broker balances every `intervalMs` (default 3 min) + a boot tick. */
export function startBalanceSync(
  db: TypedClient,
  executor: MetaApiExecutor,
  log?: Logger,
  intervalMs = 3 * 60_000
): () => void {
  const boot = setTimeout(() => void syncBrokerBalances(db, executor, log), 15_000);
  const timer = setInterval(() => void syncBrokerBalances(db, executor, log), intervalMs);
  return () => {
    clearTimeout(boot);
    clearInterval(timer);
  };
}
