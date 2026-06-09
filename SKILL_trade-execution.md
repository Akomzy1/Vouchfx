# SKILL: trade-execution

**Repo location:** `.claude/skills/trade-execution/SKILL.md`
**Owns:** placing, modifying, cancelling, and closing trades on the broker via MetaApi, behind a platform-agnostic interface, with absolute idempotency.

## The Executor interface (platform-agnostic)
Define one interface in `packages/core` so MT5 (now) and cTrader/Deriv/DXTrade/TradeLocker (later) are interchangeable. MT5 is the first implementation via MetaApi.

```ts
interface Executor {
  validateConnection(conn: BrokerConnection): Promise<AccountInfo>;
  resolveSymbol(raw: string, conn: BrokerConnection): Promise<string | null>; // suffix/gold-format mapping
  placeOrder(req: OrderRequest): Promise<OrderResult>;     // market or pending, multi-TP aware
  modifyOrder(ref: TradeRef, changes: OrderChanges): Promise<void>; // SL/TP/BE
  cancelPending(ref: TradeRef): Promise<void>;             // delete unfilled order
  closePosition(ref: TradeRef, volume?: number): Promise<void>; // full or partial
  getState(ref: TradeRef): Promise<TradeState>;            // filled? open? closed?
}
```

## Idempotency — the most important rule in the codebase
- The job id in BullMQ **is** the idempotency key: `${chat_id}:${message_id}:${edit_version}`.
- Before placing, attempt to insert the `trades` row guarded by a uniqueness constraint per `parsed_signal_id` for open/pending states, using `INSERT ... ON CONFLICT DO NOTHING`. If no row is inserted, a trade already exists → **do not place**.
- A worker crash/restart mid-execution must never produce a second order. Reconcile on restart: for any `trades` row in an ambiguous state, call `getState` against the broker before acting.
- MetaApi's own request idempotency (client-supplied id) should also be used as a second layer where available.

## Placing orders
- Support market and pending (limit/stop), buy/sell.
- **Multi-TP:** split the computed volume across TPs per the user's allocation (e.g. 0.04/0.04/0.04 for a 0.12 lot, 3-TP signal). Each leg is its own broker position/order so each TP can close independently; SL is shared.
- Resolve the broker symbol first (`resolveSymbol`) — never assume `XAUUSD`; brokers use `GOLD`, `XAUUSD.m`, suffixes, etc.
- The **risk engine** supplies the volume; the executor never computes risk. It receives a fully-sized `OrderRequest`.

## Cancel vs close (do not conflate)
- `CANCEL_PENDING` → `cancelPending`: delete an order that has **not filled**. If `getState` shows it already filled, escalate to close logic instead.
- `CLOSE_ALL` → `closePosition` on every leg of the matched trade.
- `CLOSE_PARTIAL` → `closePosition` with a volume.
- `MOVE_TO_BE` → `modifyOrder` setting SL to entry.
- **Match to the right trade** by channel + symbol + originating signal (`references_prior_trade`). If no matching VouchFX-managed order/position exists, log and ignore — never touch an unrelated or manually-opened trade.
- Telegram message delete/edit on an unfilled signal arrives pre-classified as `CANCEL_PENDING` → cancel it; if filled, apply the user's close policy and surface to the user.

## Reliability
- Wrap MetaApi connections in a supervisor with exponential backoff + circuit breaker.
- On broker `DISCONNECTED`: pause execution for that account, surface a dashboard banner, auto-resume on reconnect. Queue jobs wait; they do not fail-and-drop.
- Every action writes a `trade_events` row referencing the source Telegram message id.
- Latency target: median message→order-confirmed ≤ 1s; co-locate executor workers in MetaApi NY/London regions.

## Security
- Decrypt broker credentials only in worker memory, just-in-time; never log them.
- Prefer investor/trade-only passwords (no withdrawal rights). MetaApi cannot withdraw funds — trading access is split from deposit/withdrawal by the broker — but still never request or store withdrawal-capable credentials.

## Cost control
- Use regular-reliability MetaApi for Starter, high-reliability for Pro/Funded.
- Undeploy MetaApi accounts after prolonged inactivity (mind the 6-hour minimum billing per server start — only worth it for multi-week inactivity).
