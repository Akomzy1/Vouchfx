// ── Executor interface — platform-agnostic (see trade-execution SKILL) ─────
// MT5 (via MetaApi) is the first implementation.
// cTrader / DXTrade / TradeLocker / Deriv implement the same interface later.

import type { SymbolSpec } from "../risk/types";
export type { SymbolSpec };

export interface BrokerConnection {
  id: string;
  userId: string;
  metaApiAccountId: string;
  platform: "MT5" | "MT4";
}

export interface AccountInfo {
  balance: number;
  equity: number;
  currency: string;
  leverage: number;
  broker: string;
}

export interface OrderRequest {
  connectionId: string;
  symbol: string;
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "STOP";
  volume: number;
  entryPrice?: number;
  sl?: number;
  tp?: number;
  /** Client-supplied idempotency id (= BullMQ job id = idempotency key) */
  clientOrderId: string;
  comment?: string;
}

export interface OrderResult {
  brokerId: string;
  symbol: string;
  volume: number;
  fillPrice: number;
  openTime: Date;
}

export interface TradeRef {
  connectionId: string;
  brokerId: string;
}

export interface OrderChanges {
  sl?: number;
  tp?: number;
}

export type TradeState = "PENDING" | "FILLED" | "CLOSED" | "CANCELLED" | "UNKNOWN";

export interface Executor {
  validateConnection(conn: BrokerConnection): Promise<AccountInfo>;
  /** Fetch live account balance in account currency. */
  getAccountBalance(conn: BrokerConnection): Promise<number>;
  /** Fetch live balance + equity (equity = balance + floating P&L). */
  getAccountInfo(conn: BrokerConnection): Promise<{ balance: number; equity: number }>;
  /**
   * Sum of profits from closed deals since `since` (UTC).
   * Returns 0 if the broker history API is unavailable.
   */
  getTodayRealizedPnl(conn: BrokerConnection, since: Date): Promise<number>;
  /** Fetch broker symbol specification needed by the risk engine. */
  getSymbolSpec(symbol: string, conn: BrokerConnection): Promise<SymbolSpec>;
  /**
   * Current bid/ask quote. Price reference for sizing market orders that
   * state no entry price. Throws if no quote is available — callers must
   * skip-with-reason rather than size from a fabricated price.
   */
  getSymbolPrice(symbol: string, conn: BrokerConnection): Promise<{ bid: number; ask: number }>;
  /** Resolve broker-specific symbol suffix/gold-format. Returns null if unavailable. */
  resolveSymbol(raw: string, conn: BrokerConnection): Promise<string | null>;
  placeOrder(req: OrderRequest): Promise<OrderResult>;
  modifyOrder(ref: TradeRef, changes: OrderChanges): Promise<void>;
  /** Delete an unfilled pending order. If already filled, throws — caller must closePosition. */
  cancelPending(ref: TradeRef): Promise<void>;
  closePosition(ref: TradeRef, volume?: number): Promise<void>;
  getState(ref: TradeRef): Promise<TradeState>;
}
