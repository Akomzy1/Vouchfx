/**
 * MetaApiExecutor — MetaTrader 5 implementation of the Executor interface.
 *
 * Uses the MetaApi cloud SDK to connect to a user's MT5 account via the
 * MetaApi cloud proxy. The user never interacts with MetaApi directly.
 *
 * Security:
 *   - The MetaApi token is passed in at construction; never logged.
 *   - Broker credentials live in MetaApi's cloud; the token is the only secret here.
 *
 * Lifecycle (P0.4 spike):
 *   - Call register(conn) before using any method.
 *   - Connections are lazily established and pooled per metaApiAccountId.
 *   - Call close() when the process is shutting down.
 *
 * Not yet implemented in P0.4 (stubs that throw):
 *   modifyOrder, cancelPending, closePosition, getState — added in P1.11/P1.12.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MetaApi = require("metaapi.cloud-sdk").default as {
  new (token: string): MetaApiInstance;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MetaApiInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcConnection = any;

import type {
  Executor,
  BrokerConnection,
  AccountInfo,
  OrderRequest,
  OrderResult,
  TradeRef,
  OrderChanges,
  TradeState,
  SymbolSpec,
} from "../types/executor";

import { createHash } from "node:crypto";
import { SYMBOL_VARIANTS } from "./symbol-map";

/**
 * MetaApi clientId must match the pattern TE_<symbol>_<id> — verified
 * empirically against the live API (2026-06-12): "TE_GBPUSD_x…" passes,
 * "vfx…"/"vfxhash"/"TE_x…" (one segment) are all rejected with "Value must
 * match required pattern". Both segments must be alphanumeric; broker
 * symbols can carry suffixes like ".micro", so the symbol is sanitized.
 * The id segment is a deterministic hash of the idempotency key
 * ("<chatId>:<msgId>:<edit>", whose colons fail validation outright).
 */
export function toMetaApiClientId(symbol: string, clientOrderId: string): string {
  const sym = symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "X";
  const id = createHash("sha256").update(clientOrderId).digest("hex").slice(0, 12);
  return `TE_${sym}_${id}`;
}

export class MetaApiExecutor implements Executor {
  private readonly api: MetaApiInstance;
  // connectionId (our DB id) → metaApiAccountId
  private readonly registry = new Map<string, string>();
  // metaApiAccountId → live RPC connection
  private readonly pool = new Map<string, RpcConnection>();

  constructor(token: string) {
    this.api = new MetaApi(token);
  }

  /**
   * Register a BrokerConnection so the executor can resolve its MetaApi account.
   * Must be called before validateConnection / placeOrder / etc.
   */
  register(conn: BrokerConnection): void {
    this.registry.set(conn.id, conn.metaApiAccountId);
  }

  /** Return (creating if needed) the RPC connection for this connectionId. */
  private async rpc(connectionId: string): Promise<RpcConnection> {
    const metaApiAccountId = this.registry.get(connectionId);
    if (!metaApiAccountId) {
      throw new Error(`[executor] connection not registered: ${connectionId}`);
    }

    const cached = this.pool.get(metaApiAccountId);
    if (cached) return cached;

    const account = await this.api.metatraderAccountApi.getAccount(metaApiAccountId);

    // Deploy if not yet deployed; waitConnected waits for the broker handshake.
    await account.waitConnected({ timeoutInSeconds: 60 });

    const conn = account.getRPCConnection();
    await conn.connect();
    await conn.waitSynchronized({ timeoutInSeconds: 60 });

    this.pool.set(metaApiAccountId, conn);
    return conn;
  }

  // ── Interface methods ──────────────────────────────────────────────────────

  async validateConnection(conn: BrokerConnection): Promise<AccountInfo> {
    this.register(conn);
    const connection = await this.rpc(conn.id);
    const info = await connection.getAccountInformation();
    return {
      balance: info.balance as number,
      equity: info.equity as number,
      currency: info.currency as string,
      leverage: info.leverage as number,
      broker: (info.broker as string | undefined) ?? "Unknown",
    };
  }

  async getAccountBalance(conn: BrokerConnection): Promise<number> {
    this.register(conn);
    const connection = await this.rpc(conn.id);
    const info = await connection.getAccountInformation();
    return info.balance as number;
  }

  async getAccountInfo(
    conn: BrokerConnection
  ): Promise<{ balance: number; equity: number; accountMode: "demo" | "live" | null }> {
    this.register(conn);
    const connection = await this.rpc(conn.id);
    const info = await connection.getAccountInformation();
    // MT5 reports ACCOUNT_TRADE_MODE_DEMO / ACCOUNT_TRADE_MODE_REAL (contest → null)
    const type = String(info.type ?? "").toUpperCase();
    const accountMode: "demo" | "live" | null = type.includes("DEMO")
      ? "demo"
      : type.includes("REAL")
        ? "live"
        : null;
    return { balance: info.balance as number, equity: info.equity as number, accountMode };
  }

  async getTodayRealizedPnl(conn: BrokerConnection, since: Date): Promise<number> {
    this.register(conn);
    const connection = await this.rpc(conn.id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deals: any[] = await connection.getDealsByTimeRange(since, new Date());
      return deals.reduce((sum: number, d: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return sum + (Number((d as any).profit) || 0);
      }, 0);
    } catch {
      // History API unavailable on this account type (e.g. demo, read-only)
      return 0;
    }
  }

  async getSymbolSpec(symbol: string, conn: BrokerConnection): Promise<SymbolSpec> {
    this.register(conn);
    const connection = await this.rpc(conn.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: any = await connection.getSymbolSpecification(symbol);
    return {
      symbol,
      contractSize: (s.contractSize as number) ?? 100_000,
      tickSize: (s.tickSize as number) ?? 0.00001,
      tickValue: (s.tickValue as number) ?? 1.0,
      volumeStep: (s.volumeStep as number) ?? 0.01,
      volumeMin: (s.minVolume as number) ?? 0.01,
      volumeMax: (s.maxVolume as number) ?? 500,
    };
  }

  async getSymbolPrice(symbol: string, conn: BrokerConnection): Promise<{ bid: number; ask: number }> {
    this.register(conn);
    const connection = await this.rpc(conn.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = await connection.getSymbolPrice(symbol);
    const bid = (p?.bid as number | undefined) ?? 0;
    const ask = (p?.ask as number | undefined) ?? 0;
    if (!(bid > 0) || !(ask > 0)) {
      throw new Error(`[executor] no live quote for ${symbol}`);
    }
    return { bid, ask };
  }

  async resolveSymbol(raw: string, conn: BrokerConnection): Promise<string | null> {
    const connection = await this.rpc(conn.id);
    const variants = SYMBOL_VARIANTS[raw] ?? [raw];

    for (const candidate of variants) {
      try {
        await connection.getSymbolSpecification(candidate);
        return candidate; // first variant the broker knows about
      } catch {
        // not available on this broker — try next
      }
    }
    return null;
  }

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    const connection = await this.rpc(req.connectionId);
    const { symbol, side, orderType, volume, entryPrice, sl, tp, clientOrderId, comment } = req;

    const opts = {
      comment: comment ?? "VouchFX",
      clientId: toMetaApiClientId(symbol, clientOrderId),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tradeResult: any;

    if (orderType === "MARKET") {
      tradeResult =
        side === "BUY"
          ? await connection.createMarketBuyOrder(symbol, volume, sl, tp, opts)
          : await connection.createMarketSellOrder(symbol, volume, sl, tp, opts);
    } else if (orderType === "LIMIT") {
      if (entryPrice == null) throw new Error("[executor] LIMIT order requires entryPrice");
      tradeResult =
        side === "BUY"
          ? await connection.createLimitBuyOrder(symbol, volume, entryPrice, sl, tp, opts)
          : await connection.createLimitSellOrder(symbol, volume, entryPrice, sl, tp, opts);
    } else {
      // STOP
      if (entryPrice == null) throw new Error("[executor] STOP order requires entryPrice");
      tradeResult =
        side === "BUY"
          ? await connection.createStopBuyOrder(symbol, volume, entryPrice, sl, tp, opts)
          : await connection.createStopSellOrder(symbol, volume, entryPrice, sl, tp, opts);
    }

    // numericCode 0 = success, 10009 = TRADE_RETCODE_DONE (also success)
    const code = tradeResult.numericCode as number;
    if (code !== 0 && code !== 10009) {
      throw new Error(
        `[executor] order rejected: code=${code} (${tradeResult.stringCode as string}) — ${tradeResult.message as string}`
      );
    }

    const brokerId = (tradeResult.positionId ?? tradeResult.orderId ?? "unknown") as string;

    // For market orders: query the position to get the fill price.
    let fillPrice = 0;
    let openTime = new Date();

    if (orderType === "MARKET" && tradeResult.positionId) {
      try {
        const pos = await connection.getPosition(tradeResult.positionId as string);
        fillPrice = (pos?.openPrice as number | undefined) ?? 0;
        openTime = pos?.time ? new Date(pos.time as string) : new Date();
      } catch {
        // Position not immediately visible — fall back to scanning all positions
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const positions: any[] = await connection.getPositions();
          const match = positions.find((p) => p.id === tradeResult.positionId);
          fillPrice = (match?.openPrice as number | undefined) ?? 0;
          openTime = match?.time ? new Date(match.time as string) : new Date();
        } catch {
          // Best-effort; fillPrice stays 0 and caller can see it in the log
        }
      }
    }

    return { brokerId, symbol, volume, fillPrice, openTime };
  }

  async modifyOrder(ref: TradeRef, changes: OrderChanges): Promise<void> {
    const connection = await this.rpc(ref.connectionId);
    let sl = changes.sl;
    let tp = changes.tp;
    // modifyPosition REPLACES both SL and TP — a missing value wipes that side.
    // Preserve the side we're not changing by reading it from the live position.
    if (sl === undefined || tp === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pos: any = await connection.getPosition(ref.brokerId);
      if (sl === undefined) sl = (pos?.stopLoss as number | undefined);
      if (tp === undefined) tp = (pos?.takeProfit as number | undefined);
    }
    await connection.modifyPosition(ref.brokerId, sl, tp);
  }

  async cancelPending(ref: TradeRef): Promise<void> {
    const connection = await this.rpc(ref.connectionId);
    await connection.cancelOrder(ref.brokerId);
  }

  async closePosition(ref: TradeRef, volume?: number): Promise<void> {
    const connection = await this.rpc(ref.connectionId);
    if (volume !== undefined) {
      await connection.closePositionPartially(ref.brokerId, volume);
    } else {
      await connection.closePosition(ref.brokerId);
    }
  }

  async getState(ref: TradeRef): Promise<TradeState> {
    const connection = await this.rpc(ref.connectionId);

    // 1. Check open positions
    try {
      const pos = await connection.getPosition(ref.brokerId);
      if (pos) return "FILLED";
    } catch { /* not an open position */ }

    // 2. Check pending orders
    try {
      const ord = await connection.getOrder(ref.brokerId);
      if (ord) return "PENDING";
    } catch { /* not a pending order */ }

    // 3. Must be closed/cancelled — default to CLOSED
    return "CLOSED";
  }

  /** Close all pooled connections. Call on process shutdown. */
  close(): void {
    this.pool.clear();
    this.registry.clear();
  }
}
