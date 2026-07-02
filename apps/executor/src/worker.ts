/**
 * BullMQ worker — consumes "vouchfx-signals" jobs.
 *
 * Pipeline per job:
 *   received → parse (Claude) → gate → upsert parsed_signal
 *   → NEW_SIGNAL: pre-check idempotency → multi-TP leg insertion + placement
 *   → FOLLOW-UP:  lookup originating trades → dispatch (modify/cancel/close)
 *   → audit trail at every step.
 *
 * Idempotency (three layers):
 *   1. BullMQ job ID deduplicates in-flight jobs (primary guard).
 *   2. parsed_signals UNIQUE(source_id, telegram_message_id) — historical replay.
 *   3. SELECT pre-check before inserting any trade legs — prevents double-execution
 *      on retry after a crash mid-placement.
 *      (P1.13 adds MetaApi client-request-id + getState reconciliation.)
 */

import type Anthropic from "@anthropic-ai/sdk";
import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { CONFIDENCE_THRESHOLD, MODELS, env } from "@vouchfx/config";
import type { MetaApiExecutor } from "@vouchfx/core/executor";
import { createPushSender } from "@vouchfx/core/push";
import {
  parseSignalWithEscalation,
  gateAndSize,
  DEFAULT_RISK_SETTINGS,
  notify,
  canExecute,
  getEntitlements,
  createLogger,
  type BrokerConnection,
  type OrderRequest,
  type TradeRef,
  type OrderChanges,
  type SignalJobData,
  type ParsedSignal,
  type PriorSignalContext,
  type RiskSettings,
  type SlUnit,
  type Plan,
  type SubscriptionStatus,
} from "@vouchfx/core";
import {
  writeAuditEvent,
  type TypedClient,
  type ParsedSignalInsert,
  type TradeInsert,
  type TradeRow,
} from "@vouchfx/db";
import { checkNewsFilterGate } from "./calendar";

const workerLog = createLogger("executor:worker");

/** Map DB risk_settings row to the risk engine's RiskSettings shape. */
function dbRowToRiskSettings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: Record<string, any>
): RiskSettings {
  const modeMap: Record<string, RiskSettings["mode"]> = {
    percent_balance: "percent_balance",
    fixed_lot: "fixed_lot",
    fixed_usd_risk: "fixed_dollar_risk",
  };
  const mirrorLotMap: Record<string, RiskSettings["mirrorLotMode"]> = {
    provider_lot: "provider_lot",
    fixed_lot: "fixed_lot",
    risk_based: "risk_based",
  };
  return {
    mode: modeMap[row.sizing_mode as string] ?? "percent_balance",
    riskPercent: Number(row.risk_per_trade_pct ?? 0.5),
    fixedLot: Number(row.fixed_lot_size ?? DEFAULT_RISK_SETTINGS.fixedLot),
    fixedDollarRisk: Number(row.fixed_usd_risk ?? DEFAULT_RISK_SETTINGS.fixedDollarRisk),
    defaultSlPips: Number(row.default_sl_pips ?? DEFAULT_RISK_SETTINGS.defaultSlPips),
    defaultSlPipsGold: Number(row.default_sl_pips_gold ?? DEFAULT_RISK_SETTINGS.defaultSlPipsGold),
    defaultSlPolicy: (row.default_sl_policy as RiskSettings["defaultSlPolicy"]) ?? "skip",
    maxTrades: 0,
    maxTradesPerDay: Number(row.max_trades_per_day ?? 0),
    dailySignalLimit: Number(row.daily_signal_limit ?? 0),
    dailyLossCapPercent: Number(row.daily_loss_cap_pct ?? 0),
    dailyLossCapAction: (row.daily_loss_cap_action as RiskSettings["dailyLossCapAction"]) ?? "pause",
    breakevenAfterTp1: Boolean(row.breakeven_after_tp1 ?? false),
    trailingAfterTp2: Boolean(row.trailing_after_tp2 ?? false),
    executionMode: row.execution_mode === "mirror_provider" ? "mirror_provider" : "apply_my_rules",
    mirrorLotMode: mirrorLotMap[row.mirror_lot_mode as string] ?? "risk_based",
    mirrorAllowNoSl: Boolean(row.mirror_allow_no_sl ?? false),
    newsFilterEnabled: Boolean(row.news_filter_enabled ?? false),
    newsFilterWindowMin: Number(row.news_filter_window_min ?? 60),
  };
}

const QUEUE_NAME = "vouchfx-signals";

export interface WorkerDeps {
  db: TypedClient;
  anthropic: Anthropic;
  executor: MetaApiExecutor;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Look up active trade legs via a follow-up reference to the originating message.
 *  Scoped to ONE account (broker_connection_id) so multi-account follow-ups only
 *  touch the trades on the account this job is for. */
async function findActiveTrades(
  db: TypedClient,
  sourceId: string,
  priorMessageId: number,
  brokerConnectionId: string
): Promise<TradeRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: origPs } = await (db as any)
    .from("parsed_signals")
    .select("id")
    .eq("source_id", sourceId)
    .eq("telegram_message_id", priorMessageId)
    .maybeSingle();

  if (!origPs) return [];
  return findActiveTradesBySignalId(db, (origPs as { id: string }).id, brokerConnectionId);
}

/** Look up active trade legs by parsed_signal_id on ONE account — used by cancel jobs. */
async function findActiveTradesBySignalId(
  db: TypedClient,
  parsedSignalId: string,
  brokerConnectionId: string
): Promise<TradeRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from("trades")
    .select("*")
    .eq("parsed_signal_id", parsedSignalId)
    .eq("broker_connection_id", brokerConnectionId)
    .in("status", ["PENDING", "OPEN"]);
  return (data ?? []) as TradeRow[];
}

/**
 * Fallback for free-text follow-ups (e.g., "close XAUUSD", "scrap it"):
 * when the model sets references_prior_trade but has no message_id reference,
 * match by symbol among this account's active trades.
 */
async function findActiveTradesBySymbol(
  db: TypedClient,
  userId: string,
  symbol: string,
  brokerConnectionId: string
): Promise<TradeRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from("trades")
    .select("*")
    .eq("user_id", userId)
    .eq("symbol", symbol)
    .eq("broker_connection_id", brokerConnectionId)
    .in("status", ["PENDING", "OPEN"]);
  return (data ?? []) as TradeRow[];
}

/**
 * Fallback for follow-ups with no message reference and no symbol
 * (e.g. "Set SL to breakeven", "close it"): apply to this account's active
 * trades opened from THIS channel's signals. A provider posting a bare
 * management instruction in their channel means it for the trade(s) they gave.
 */
async function findActiveTradesBySource(
  db: TypedClient,
  sourceId: string,
  brokerConnectionId: string
): Promise<TradeRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: psRows } = await (db as any)
    .from("parsed_signals")
    .select("id")
    .eq("source_id", sourceId);
  const ids = ((psRows ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from("trades")
    .select("*")
    .in("parsed_signal_id", ids)
    .eq("broker_connection_id", brokerConnectionId)
    .in("status", ["PENDING", "OPEN"]);
  return (data ?? []) as TradeRow[];
}

/**
 * Fetch the MetaApi account ID and platform for a broker connection.
 * Throws if the connection is not found or has not yet been provisioned.
 */
async function lookupBrokerConn(
  db: TypedClient,
  brokerConnectionId: string
): Promise<{ metaApiAccountId: string; platform: "MT5" | "MT4" }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("broker_connections")
    .select("metaapi_account_id, platform")
    .eq("id", brokerConnectionId)
    .single();

  if (error || !data) {
    throw new Error(`[worker] broker connection not found: ${brokerConnectionId}`);
  }

  const metaApiAccountId = (data as { metaapi_account_id: string | null }).metaapi_account_id;
  if (!metaApiAccountId) {
    throw new Error(
      `[worker] broker connection ${brokerConnectionId} has no MetaApi account ID — still deploying?`
    );
  }

  const platform = ((data as { platform: string }).platform ?? "MT5") as "MT5" | "MT4";
  return { metaApiAccountId, platform };
}

const VAPID = {
  publicKey: env.VAPID_PUBLIC_KEY,
  privateKey: env.VAPID_PRIVATE_KEY,
  subject: env.VAPID_SUBJECT,
};

/**
 * Fire-and-forget notification helper.
 * Fetches the user's email then calls notify(). Errors are silently swallowed
 * so notification failures never block the execution path. Push is delivered as
 * a third channel (alongside in-app + email) when VAPID is configured —
 * createPushSender returns null otherwise, so notify() just skips it.
 */
function notifyAsync(
  db: TypedClient,
  userId: string,
  event: Parameters<typeof notify>[1]["event"],
  title: string,
  body?: string
): void {
  Promise.resolve()
    .then(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: userRow } = await (db as any)
        .from("users")
        .select("email")
        .eq("id", userId)
        .maybeSingle();
      await notify(db as Parameters<typeof notify>[0], {
        userId,
        toEmail: (userRow as { email?: string } | null)?.email ?? null,
        event,
        title,
        body,
        resendApiKey: env.RESEND_API_KEY ?? null,
        pushSender: createPushSender(db as Parameters<typeof createPushSender>[0], VAPID),
      });
    })
    .catch(() => undefined);
}

/** Write the latest balance/equity to broker_connections for the web dashboard. */
async function cacheBalanceInDb(
  db: TypedClient,
  brokerConnectionId: string,
  balance: number,
  equity: number,
  accountMode: "demo" | "live" | null = null
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)
      .from("broker_connections")
      .update({
        last_balance_usd: balance,
        last_equity_usd: equity,
        last_synced_at: new Date().toISOString(),
        ...(accountMode ? { account_mode: accountMode } : {}),
      })
      .eq("id", brokerConnectionId);
  } catch {
    // Non-critical — dashboard will show stale data until next sync
  }
}

// ── Plan gate (trial enforcement) ────────────────────────────────────────────

/**
 * Checks the user's active subscription:
 *   - If trial has expired in the DB (trial_ends_at < now), marks it expired.
 *   - Blocks execution when canExecute() returns false.
 *   - Returns the plan's maxSignalsPerDay cap (0 = unlimited) for downstream use.
 *
 * For NEW users with no subscription row (race condition before the trigger fires),
 * we treat them as an active trial.
 */
async function checkPlanGate(
  db: TypedClient,
  userId: string
): Promise<{ ok: true; planSignalCap: number } | { ok: false; reason: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: subRow } = await (db as any)
    .from("subscriptions")
    .select("id, plan, status, trial_ends_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // No subscription row yet — treat as fresh trial (trigger may not have fired)
  if (!subRow) {
    return { ok: true, planSignalCap: 1 }; // trial-equivalent cap
  }

  const sub = subRow as { id: string; plan: string; status: string; trial_ends_at: string | null };

  // Inline trial expiry: if trialing but trial_ends_at is in the past, expire it now
  if (sub.status === "trialing" && sub.trial_ends_at && new Date(sub.trial_ends_at) < new Date()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from("subscriptions").update({ status: "expired" }).eq("id", sub.id);
    sub.status = "expired";
  }

  const plan = (sub.plan ?? "trial") as Plan;
  const status = sub.status as SubscriptionStatus;

  if (!canExecute(plan, status)) {
    return {
      ok: false,
      reason: `plan_gate:plan=${plan} status=${status}`,
    };
  }

  const { maxSignalsPerDay } = getEntitlements(plan);
  return { ok: true, planSignalCap: maxSignalsPerDay };
}

// ── Daily limits gate ─────────────────────────────────────────────────────────

/**
 * Check daily signal + trade-leg caps before execution.
 *
 * Semantics:
 *   - Signal count: 1 per NEW_SIGNAL acted on (distinct parsed_signal_id in trades today).
 *     Multi-TP signals still count as 1 signal regardless of how many legs they spawn.
 *   - Trade count: 1 per leg inserted today (volume of broker activity).
 *   - Per-channel limit: sourced from signal_sources.daily_signal_limit; null = inherit global.
 *   - Day boundary: midnight UTC.
 *   - 0 = unlimited for every cap.
 */
async function checkDailyLimits(
  db: TypedClient,
  userId: string,
  sourceId: string,
  riskSettings: RiskSettings
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayStartISO = todayStart.toISOString();

  // Fetch today's non-skipped trade legs for this user (id + parsed_signal_id only).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: todayTrades } = await (db as any)
    .from("trades")
    .select("id, parsed_signal_id")
    .eq("user_id", userId)
    .gte("created_at", todayStartISO)
    .neq("status", "SKIPPED");

  const tradeRows = (todayTrades ?? []) as { id: string; parsed_signal_id: string }[];
  const tradeLegCount = tradeRows.length;
  const globalSignalCount = new Set(tradeRows.map((r) => r.parsed_signal_id)).size;

  // Max trade legs per day
  if (riskSettings.maxTradesPerDay > 0 && tradeLegCount >= riskSettings.maxTradesPerDay) {
    return { ok: false, reason: `max_trades_per_day:${tradeLegCount}/${riskSettings.maxTradesPerDay}` };
  }

  // Global daily signal limit
  if (riskSettings.dailySignalLimit > 0 && globalSignalCount >= riskSettings.dailySignalLimit) {
    return { ok: false, reason: `daily_signal_limit:${globalSignalCount}/${riskSettings.dailySignalLimit}` };
  }

  // Per-channel daily signal limit (only when the channel has its own override)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sourceRow } = await (db as any)
    .from("signal_sources")
    .select("daily_signal_limit")
    .eq("id", sourceId)
    .maybeSingle();

  const channelLimit: number = (sourceRow as { daily_signal_limit: number | null } | null)
    ?.daily_signal_limit ?? 0;

  if (channelLimit > 0) {
    const allActedPsIds = [...new Set(tradeRows.map((r) => r.parsed_signal_id))];
    let channelSignalCount = 0;

    if (allActedPsIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: channelPs } = await (db as any)
        .from("parsed_signals")
        .select("id")
        .eq("source_id", sourceId)
        .in("id", allActedPsIds);
      channelSignalCount = (channelPs ?? []).length;
    }

    if (channelSignalCount >= channelLimit) {
      return { ok: false, reason: `channel_daily_signal_limit:${channelSignalCount}/${channelLimit}` };
    }
  }

  return { ok: true };
}

// ── Follow-up dispatch ────────────────────────────────────────────────────────

/**
 * Apply a modify (SL/TP change) to ONE leg, fault-tolerantly.
 *  - returns "applied" on success (and patches the DB row)
 *  - returns "missing" if the broker reports the position is gone (it was
 *    closed externally) — the DB row is reconciled to CLOSED so it stops
 *    matching future follow-ups
 *  - rethrows any other (transient) error so BullMQ can retry the job
 * One dead leg must never abort a batch of otherwise-valid legs.
 */
async function modifyLegSafe(
  db: TypedClient,
  executor: MetaApiExecutor,
  brokerConn: BrokerConnection,
  trade: TradeRow,
  changes: OrderChanges,
  dbPatch: Record<string, unknown>,
  tag: string,
  label: string
): Promise<"applied" | "missing"> {
  const ref: TradeRef = { connectionId: brokerConn.id, brokerId: trade.broker_order_id! };
  try {
    await executor.modifyOrder(ref, changes);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from("trades").update(dbPatch).eq("id", trade.id);
    console.log(`${tag} ${label} ${shortId(trade.id)} applied`);
    return "applied";
  } catch (err) {
    const msg = String((err as Error).message ?? err);
    if (/not found|no position|position.*closed/i.test(msg)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from("trades")
        .update({ status: "CLOSED", closed_at: new Date().toISOString() })
        .eq("id", trade.id);
      console.warn(`${tag} ${label} ${shortId(trade.id)} — position gone on broker; reconciled to CLOSED`);
      return "missing";
    }
    throw err; // genuine/transient error → let the job retry
  }
}

async function dispatchFollowUp(
  tag: string,
  db: TypedClient,
  executor: MetaApiExecutor,
  brokerConn: BrokerConnection,
  parsed: ParsedSignal,
  parsedSignalId: string,
  userId: string,
  sourceId: string
): Promise<void> {
  const { follow_up_type, references_prior_message_id } = parsed;

  if (follow_up_type === "IGNORE") {
    console.log(`${tag} follow-up IGNORE — no action`);
    await writeAuditEvent(db, { userId, eventType: "skipped", parsedSignalId, payload: { reason: "follow_up_IGNORE" } });
    return;
  }

  // Resolve which active trades this follow-up targets.
  //   Path A: message ID known → exact match via source + message_id
  //   Path B: free-text cancel/close (e.g., "close XAUUSD") → match by user + symbol
  //   Path C: no reference at all → skip with reason
  let activeTrades: TradeRow[];
  let matchMethod: string;

  if (references_prior_message_id) {
    activeTrades = await findActiveTrades(db, sourceId, references_prior_message_id, brokerConn.id);
    matchMethod = `msg_id=${references_prior_message_id}`;
  } else if (parsed.symbol) {
    activeTrades = await findActiveTradesBySymbol(db, userId, parsed.symbol, brokerConn.id);
    matchMethod = `symbol=${parsed.symbol}`;
  } else {
    // No reply-reference and no symbol → apply to this channel's open trade(s).
    activeTrades = await findActiveTradesBySource(db, sourceId, brokerConn.id);
    matchMethod = "channel";
  }

  if (activeTrades.length === 0) {
    console.log(`${tag} follow-up ${follow_up_type} — no matching active trades (${matchMethod})`);
    await writeAuditEvent(db, { userId, eventType: "skipped", parsedSignalId, payload: { reason: "follow_up_no_active_trade", match_method: matchMethod } });
    return;
  }

  console.log(`${tag} follow-up ${follow_up_type} — found ${activeTrades.length} active leg(s) via ${matchMethod}`);

  switch (follow_up_type) {
    case "MODIFY_SL": {
      if (parsed.sl == null) {
        await writeAuditEvent(db, { userId, eventType: "skipped", parsedSignalId, payload: { reason: "MODIFY_SL_no_sl_value" } });
        return;
      }
      let applied = 0, missing = 0;
      for (const trade of activeTrades) {
        if (!trade.broker_order_id) continue;
        const r = await modifyLegSafe(
          db, executor, brokerConn, trade,
          { sl: parsed.sl }, { sl: parsed.sl }, tag, "MODIFY_SL",
        );
        if (r === "applied") applied++; else missing++;
      }
      if (applied > 0) {
        await writeAuditEvent(db, { userId, eventType: "modified", parsedSignalId, payload: { follow_up_type, new_sl: parsed.sl, legs: applied, skipped_missing: missing } });
      } else {
        await writeAuditEvent(db, { userId, eventType: "skipped", parsedSignalId, payload: { reason: "no_live_positions_to_modify", missing } });
      }
      break;
    }

    case "MODIFY_TP": {
      if (!parsed.tps.length) {
        await writeAuditEvent(db, { userId, eventType: "skipped", parsedSignalId, payload: { reason: "MODIFY_TP_no_tp_value" } });
        return;
      }
      // Assign new TPs round-robin across legs (most common case: 1 new TP for 1 leg)
      let applied = 0, missing = 0;
      for (let i = 0; i < activeTrades.length; i++) {
        const trade = activeTrades[i]!;
        if (!trade.broker_order_id) continue;
        const newTp = parsed.tps[i % parsed.tps.length]!;
        const r = await modifyLegSafe(
          db, executor, brokerConn, trade,
          { tp: newTp }, { tp: newTp }, tag, "MODIFY_TP",
        );
        if (r === "applied") applied++; else missing++;
      }
      if (applied > 0) {
        await writeAuditEvent(db, { userId, eventType: "modified", parsedSignalId, payload: { follow_up_type, new_tps: parsed.tps, legs: applied, skipped_missing: missing } });
      } else {
        await writeAuditEvent(db, { userId, eventType: "skipped", parsedSignalId, payload: { reason: "no_live_positions_to_modify", missing } });
      }
      break;
    }

    case "MOVE_TO_BE": {
      let applied = 0, missing = 0;
      for (const trade of activeTrades) {
        if (!trade.broker_order_id || !trade.entry_price) continue;
        const r = await modifyLegSafe(
          db, executor, brokerConn, trade,
          { sl: trade.entry_price }, { sl: trade.entry_price, breakeven_applied: true },
          tag, "MOVE_TO_BE",
        );
        if (r === "applied") applied++; else missing++;
      }
      if (applied > 0) {
        await writeAuditEvent(db, { userId, eventType: "modified", parsedSignalId, payload: { follow_up_type, legs: applied, skipped_missing: missing } });
      } else {
        await writeAuditEvent(db, { userId, eventType: "skipped", parsedSignalId, payload: { reason: "no_live_positions_to_modify", missing } });
      }
      break;
    }

    case "CLOSE_ALL": {
      for (const trade of activeTrades) {
        if (!trade.broker_order_id) continue;
        const ref: TradeRef = { connectionId: brokerConn.id, brokerId: trade.broker_order_id };
        await executor.closePosition(ref);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).from("trades").update({ status: "CLOSED", closed_at: new Date().toISOString() }).eq("id", trade.id);
        console.log(`${tag} CLOSE_ALL ${shortId(trade.id)}`);
      }
      await writeAuditEvent(db, { userId, eventType: "closed", parsedSignalId, payload: { follow_up_type, legs: activeTrades.length } });
      break;
    }

    case "CLOSE_PARTIAL": {
      // Close first active leg at half its volume
      const trade = activeTrades[0]!;
      if (!trade.broker_order_id) return;
      const partialVolume = Math.round((trade.volume / 2) * 100) / 100;
      const ref: TradeRef = { connectionId: brokerConn.id, brokerId: trade.broker_order_id };
      await executor.closePosition(ref, partialVolume);
      console.log(`${tag} CLOSE_PARTIAL ${shortId(trade.id)} vol=${partialVolume}`);
      await writeAuditEvent(db, { userId, eventType: "closed", parsedSignalId, payload: { follow_up_type, trade_id: trade.id, partial_volume: partialVolume } });
      break;
    }

    case "CANCEL_PENDING": {
      for (const trade of activeTrades) {
        if (!trade.broker_order_id) continue;
        const ref: TradeRef = { connectionId: brokerConn.id, brokerId: trade.broker_order_id };
        const state = await executor.getState(ref);
        if (state === "FILLED") {
          // Already filled — close it instead of trying to cancel
          await executor.closePosition(ref);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db as any).from("trades").update({ status: "CLOSED", closed_at: new Date().toISOString() }).eq("id", trade.id);
          console.log(`${tag} CANCEL_PENDING→CLOSE_FILLED ${shortId(trade.id)}`);
        } else {
          // Pending/unknown — cancel it
          await executor.cancelPending(ref);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db as any).from("trades").update({ status: "CANCELLED" }).eq("id", trade.id);
          console.log(`${tag} CANCEL_PENDING ${shortId(trade.id)}`);
        }
      }
      await writeAuditEvent(db, { userId, eventType: "cancelled", parsedSignalId, payload: { follow_up_type, legs: activeTrades.length } });
      break;
    }
  }
}

// ── Drawdown guardian ────────────────────────────────────────────────────────

/** Close every PENDING/OPEN VouchFX-managed trade for this user. */
async function closeAllUserTrades(
  db: TypedClient,
  executor: MetaApiExecutor,
  userId: string,
  brokerConn: BrokerConnection,
  tag: string,
  parsedSignalId: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from("trades")
    .select("id, broker_order_id, status")
    .eq("user_id", userId)
    // Only this account's legs — each order lives on its own broker connection.
    .eq("broker_connection_id", brokerConn.id)
    .in("status", ["PENDING", "OPEN"]);

  const trades = (data ?? []) as TradeRow[];
  let closedCount = 0;

  for (const trade of trades) {
    if (!trade.broker_order_id) continue;
    const ref: TradeRef = { connectionId: brokerConn.id, brokerId: trade.broker_order_id };
    try {
      if (trade.status === "PENDING") {
        await executor.cancelPending(ref);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).from("trades").update({ status: "CANCELLED" }).eq("id", trade.id);
      } else {
        await executor.closePosition(ref);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).from("trades").update({ status: "CLOSED", closed_at: new Date().toISOString() }).eq("id", trade.id);
      }
      closedCount++;
    } catch (err) {
      console.error(`${tag} close-all: failed to close ${shortId(trade.id)}:`, (err as Error).message);
    }
  }

  await writeAuditEvent(db, {
    userId,
    eventType: "closed",
    parsedSignalId,
    payload: { reason: "drawdown_cap_close_all", closed: closedCount },
  });

  console.log(`${tag} drawdown close-all: ${closedCount} position(s) closed`);
}

/**
 * Daily loss cap gate (VCH-RSK-03).
 *
 * daily loss = -(todayRealizedPnl + floatingPnl)
 * drawdown % = daily loss / opening balance * 100
 *   where opening balance = current balance − today's realized P&L
 *
 * If the cap is hit:
 *   - "pause"           → block this and all subsequent executions today.
 *   - "pause_and_close" → also close every open VouchFX trade.
 */
async function checkDrawdown(
  db: TypedClient,
  executor: MetaApiExecutor,
  userId: string,
  brokerConn: BrokerConnection,
  riskSettings: RiskSettings,
  tag: string,
  parsedSignalId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (riskSettings.dailyLossCapPercent <= 0) return { ok: true };

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [{ balance, equity }, realizedPnl] = await Promise.all([
    executor.getAccountInfo(brokerConn),
    executor.getTodayRealizedPnl(brokerConn, todayStart),
  ]);

  const floatingPnl = equity - balance;
  const totalTodayPnl = realizedPnl + floatingPnl;

  if (totalTodayPnl >= 0) return { ok: true };

  const openingBalance = balance - realizedPnl;
  if (openingBalance <= 0) return { ok: true }; // guard against invalid state

  const drawdownPct = (-totalTodayPnl / openingBalance) * 100;

  if (drawdownPct < riskSettings.dailyLossCapPercent) return { ok: true };

  const reason = `drawdown_cap:${drawdownPct.toFixed(1)}%_vs_${riskSettings.dailyLossCapPercent}%`;
  console.log(`${tag} ${reason}`);

  if (riskSettings.dailyLossCapAction === "pause_and_close") {
    await closeAllUserTrades(db, executor, userId, brokerConn, tag, parsedSignalId);
  }

  await writeAuditEvent(db, {
    userId,
    eventType: "skipped",
    parsedSignalId,
    payload: {
      reason,
      drawdown_pct: drawdownPct,
      cap_pct: riskSettings.dailyLossCapPercent,
      today_pnl: totalTodayPnl,
      balance,
      equity,
    },
  });

  notifyAsync(
    db, userId, "daily_loss_cap_hit",
    "Daily loss cap reached",
    `Drawdown ${drawdownPct.toFixed(1)}% hit your ${riskSettings.dailyLossCapPercent}% cap. New signals paused for today.`
  );

  return { ok: false, reason };
}

// ── Breakeven-after-TP1 ───────────────────────────────────────────────────────

/**
 * For every OPEN leg whose signal already has at least one CLOSED sibling leg
 * (TP1 hit), move the SL to entry_price and mark breakeven_applied = true.
 *
 * Runs at the start of each new-signal execution so breakeven is applied
 * promptly without a separate monitoring loop. Only acts when
 * riskSettings.breakevenAfterTp1 is true (VCH-RSK-05).
 */
async function applyBreakevenOpportunities(
  db: TypedClient,
  executor: MetaApiExecutor,
  userId: string,
  brokerConn: BrokerConnection,
  riskSettings: RiskSettings,
  tag: string
): Promise<void> {
  if (!riskSettings.breakevenAfterTp1) return;

  // Fetch OPEN legs where breakeven has not yet been applied and we have
  // both a broker order ID and an entry price to move SL to.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from("trades")
    .select("id, parsed_signal_id, broker_order_id, entry_price, sl")
    .eq("user_id", userId)
    // Only this account's open legs (breakeven is placed via this connection).
    .eq("broker_connection_id", brokerConn.id)
    .eq("status", "OPEN")
    .eq("breakeven_applied", false)
    .not("entry_price", "is", null)
    .not("broker_order_id", "is", null);

  const openLegs = (data ?? []) as Array<{
    id: string;
    parsed_signal_id: string;
    broker_order_id: string;
    entry_price: number;
    sl: number | null;
  }>;

  if (openLegs.length === 0) return;

  // Group by signal so we check closed-sibling existence once per signal.
  const bySignal = new Map<string, typeof openLegs>();
  for (const leg of openLegs) {
    const arr = bySignal.get(leg.parsed_signal_id) ?? [];
    arr.push(leg);
    bySignal.set(leg.parsed_signal_id, arr);
  }

  for (const [signalId, legs] of bySignal) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: closedCount } = await (db as any)
      .from("trades")
      .select("*", { count: "exact", head: true })
      .eq("parsed_signal_id", signalId)
      .eq("status", "CLOSED");

    if (!closedCount || closedCount === 0) continue; // TP1 not yet hit

    for (const leg of legs) {
      const ref: TradeRef = { connectionId: brokerConn.id, brokerId: leg.broker_order_id };
      try {
        await executor.modifyOrder(ref, { sl: leg.entry_price });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from("trades")
          .update({ sl: leg.entry_price, breakeven_applied: true })
          .eq("id", leg.id);

        await writeAuditEvent(db, {
          userId,
          eventType: "modified",
          payload: {
            action: "breakeven_applied",
            trade_id: leg.id,
            signal_id: signalId,
            entry_price: leg.entry_price,
            prev_sl: leg.sl,
          },
        });

        console.log(`${tag} breakeven: trade=${shortId(leg.id)} sl→${leg.entry_price}`);
      } catch (err) {
        console.error(`${tag} breakeven failed for trade ${shortId(leg.id)}:`, (err as Error).message);
      }
    }
  }
}

// ── New-signal execution (multi-TP) ──────────────────────────────────────────

/** Per-channel overrides resolved from signal_sources before execution. */
interface SourceOverrides {
  /** Channel risk-per-trade override (% of equity); null = use global. */
  riskPct: number | null;
  /** Channel no-SL policy; null = inherit global default_sl_policy. */
  slPolicy: "require" | "apply_default" | null;
  /** Flip BUY/SELL for this channel (SL/TP swapped). */
  reverse: boolean;
}

async function executeNewSignal(
  tag: string,
  db: TypedClient,
  executor: MetaApiExecutor,
  brokerConn: BrokerConnection,
  parsed: ParsedSignal,
  parsedSignalId: string,
  userId: string,
  brokerConnectionId: string,
  sourceId: string,
  idempotencyKey: string,
  planSignalCap: number,  // 0 = unlimited; plan-level override for trial cap
  overrides: SourceOverrides
): Promise<void> {
  if (!parsed.symbol || !parsed.side) {
    console.log(`${tag} skipped: symbol or side missing`);
    await writeAuditEvent(db, { userId, eventType: "skipped", parsedSignalId, payload: { reason: "missing_symbol_or_side" } });
    return;
  }

  // ── Per-channel reverse: flip side, swap SL/TP ───────────────────────────
  // The original TP1 becomes the protective stop and the original SL becomes
  // the take-profit, so the stop stays on the correct side of entry. Only
  // price-unit SL/TP can be swapped safely — pip/percent offsets are
  // direction-relative and would land on the wrong side.
  let effSide: "BUY" | "SELL" = parsed.side;
  let effSl: number | null = parsed.sl;
  let effSlUnit: SlUnit = (parsed.sl_unit as SlUnit | null) ?? "price";
  let effTps: number[] = parsed.tps;

  if (overrides.reverse) {
    const slUnitOk = !parsed.sl || (parsed.sl_unit ?? "price") === "price";
    const tpUnitOk = parsed.tps.length === 0 || (parsed.tp_unit ?? "price") === "price";
    if (!slUnitOk || !tpUnitOk) {
      const reason = "reverse_unsupported_units";
      console.log(`${tag} skipped: ${reason} (sl_unit=${parsed.sl_unit} tp_unit=${parsed.tp_unit})`);
      await writeAuditEvent(db, { userId, eventType: "skipped", parsedSignalId, payload: { reason, sl_unit: parsed.sl_unit, tp_unit: parsed.tp_unit } });
      return;
    }
    effSide = parsed.side === "BUY" ? "SELL" : "BUY";
    effSl = parsed.tps[0] ?? null;
    effSlUnit = "price";
    effTps = parsed.sl != null ? [parsed.sl] : [];
    console.log(`${tag} reverse active: ${parsed.side}→${effSide}, SL=${effSl ?? "none"}, TPs=[${effTps.join(",")}]`);
  }

  // ── Idempotency pre-check ────────────────────────────────────────────────
  // Scoped to THIS account: with multi-account copying, the same parsed_signal
  // legitimately has trades on other accounts — only a prior leg on the SAME
  // account means this job already ran.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (db as any)
    .from("trades")
    .select("*", { count: "exact", head: true })
    .eq("parsed_signal_id", parsedSignalId)
    .eq("broker_connection_id", brokerConnectionId)
    .in("status", ["PENDING", "OPEN"]);

  if (count && count > 0) {
    console.log(`${tag} idempotency: ${count} active leg(s) already exist — skipping`);
    await writeAuditEvent(db, { userId, eventType: "skipped", parsedSignalId, payload: { reason: "trade_legs_already_exist", count } });
    return;
  }

  // ── Risk settings + daily limits gate ───────────────────────────────────
  // DB reads happen before any broker network calls to fail-fast cheaply.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rsRow } = await (db as any)
    .from("risk_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const riskSettings: RiskSettings = {
    ...(rsRow ? dbRowToRiskSettings(rsRow as Record<string, unknown>) : DEFAULT_RISK_SETTINGS),
  };

  // Per-channel overrides (signal_sources): risk % and no-SL policy
  if (overrides.riskPct !== null) {
    riskSettings.riskPercent = overrides.riskPct;
    console.log(`${tag} channel risk override: ${overrides.riskPct}%`);
  }
  if (overrides.slPolicy !== null) {
    riskSettings.defaultSlPolicy = overrides.slPolicy === "require" ? "skip" : "apply_default";
    console.log(`${tag} channel SL policy override: ${overrides.slPolicy}`);
  }

  // Plan-level signal cap: trial = 1/day (system-locked, cannot be overridden by user settings)
  if (planSignalCap > 0) {
    if (riskSettings.dailySignalLimit === 0 || planSignalCap < riskSettings.dailySignalLimit) {
      riskSettings.dailySignalLimit = planSignalCap;
    }
  }

  const limitsResult = await checkDailyLimits(db, userId, sourceId, riskSettings);
  if (!limitsResult.ok) {
    console.log(`${tag} skipped by daily limits: ${limitsResult.reason}`);
    await writeAuditEvent(db, {
      userId,
      eventType: "skipped",
      parsedSignalId,
      payload: { reason: `daily_limits:${limitsResult.reason}` },
    });
    return;
  }

  // ── Drawdown guardian ────────────────────────────────────────────────────
  const drawdownResult = await checkDrawdown(db, executor, userId, brokerConn, riskSettings, tag, parsedSignalId);
  if (!drawdownResult.ok) {
    return; // audit event already written inside checkDrawdown
  }

  // ── News filter (VCH-RSK-06b/06c) — reads the calendar cache ONLY ───────
  const newsGate = await checkNewsFilterGate(
    db, brokerConnectionId, parsed.symbol, riskSettings, workerLog
  );
  if (!newsGate.ok) {
    console.log(`${tag} skipped by news filter: ${newsGate.reason}`);
    await writeAuditEvent(db, {
      userId,
      eventType: "skipped",
      parsedSignalId,
      payload: { reason: newsGate.reason, symbol: parsed.symbol },
    });
    return;
  }

  // ── Resolve broker symbol ────────────────────────────────────────────────
  const resolvedSymbol = await executor.resolveSymbol(parsed.symbol, brokerConn);
  if (!resolvedSymbol) {
    const reason = `symbol_not_found: ${parsed.symbol}`;
    console.log(`${tag} skipped: ${reason}`);
    await writeAuditEvent(db, { userId, eventType: "skipped", parsedSignalId, payload: { reason } });
    return;
  }

  // ── Resolve order type and entry price ──────────────────────────────────
  const parsedOrderType = parsed.order_type ?? "MARKET";
  const entryPrice: number | undefined = parsed.entries[0];
  let orderType: "MARKET" | "LIMIT" | "STOP" =
    parsedOrderType !== "MARKET" && entryPrice == null
      ? (console.warn(`${tag} ${parsedOrderType} order has no entry price — falling back to MARKET`), "MARKET")
      : (parsedOrderType as "MARKET" | "LIMIT" | "STOP");

  // Reversed pending orders flip semantics: a BUY LIMIT below market becomes a
  // SELL at the same price below market, which brokers call a SELL STOP (and
  // vice-versa). Swap LIMIT↔STOP so the pending order remains valid.
  if (overrides.reverse && orderType !== "MARKET") {
    orderType = orderType === "LIMIT" ? "STOP" : "LIMIT";
    console.log(`${tag} reverse: pending order type flipped to ${orderType}`);
  }

  const [{ balance: accountBalance, equity: accountEquity, accountMode }, symbolSpec] = await Promise.all([
    executor.getAccountInfo(brokerConn),
    executor.getSymbolSpec(resolvedSymbol, brokerConn),
  ]);

  // Write balance + demo/live mode to broker_connections so the web dashboard
  // can display them without making MetaApi calls from Vercel serverless.
  await cacheBalanceInDb(db, brokerConnectionId, accountBalance, accountEquity, accountMode);

  // Price reference for SL-distance sizing. Market orders with no stated
  // entry use the live quote — sizing from any other number produces garbage
  // volume (a balance-as-price fallback shipped $10M dollarRisk in prod).
  // No quote available → skip-with-reason; never size from a fabricated price.
  let gatePriceRef = entryPrice;
  if (gatePriceRef == null) {
    try {
      const quote = await executor.getSymbolPrice(resolvedSymbol, brokerConn);
      gatePriceRef = effSide === "BUY" ? quote.ask : quote.bid;
    } catch (err) {
      const reason = `no_price_reference: ${(err as Error).message}`;
      console.log(`${tag} skipped: ${reason}`);
      await writeAuditEvent(db, { userId, eventType: "skipped", parsedSignalId, payload: { reason, symbol: parsed.symbol } });
      return;
    }
  }

  const gateResult = gateAndSize({
    sl: effSl,
    slUnit: effSlUnit,
    entryPrice: gatePriceRef,
    side: effSide,
    symbol: parsed.symbol ?? resolvedSymbol,
    accountBalance,
    settings: riskSettings,
    spec: symbolSpec,
    providerLot: parsed.provider_lot ?? null,
  });

  if (!gateResult.ok) {
    console.log(`${tag} skipped by risk engine: ${gateResult.reason}`);
    await writeAuditEvent(db, {
      userId,
      eventType: "skipped",
      parsedSignalId,
      payload: { reason: `risk_gate:${gateResult.reason}`, sl: effSl, sl_unit: effSlUnit, reversed: overrides.reverse },
    });
    return;
  }

  const legVolume = gateResult.volume;
  // The SL to PLACE: the signal's own SL if it gave one, otherwise the absolute
  // SL the gate computed from the default-SL policy (apply_default). Using the
  // raw signal SL alone meant no-SL signals were placed with NO stop at all.
  const placedSl = effSl ?? gateResult.slPrice ?? undefined;
  console.log(`${tag} risk gate passed: volume=${legVolume} sl=${placedSl ?? "none"} dollarRisk=${gateResult.dollarRisk.toFixed(2)} balance=${accountBalance.toFixed(2)}`);

  // ── Breakeven-after-TP1: apply to any existing eligible open legs ────────
  await applyBreakevenOpportunities(db, executor, userId, brokerConn, riskSettings, tag);

  // ── Build TP legs ────────────────────────────────────────────────────────
  const tpLegs: (number | null)[] = effTps.length > 0 ? effTps : [null];

  console.log(`${tag} placing ${tpLegs.length} leg(s) on ${resolvedSymbol} type=${orderType}${entryPrice != null ? ` entry=${entryPrice}` : ""}`);

  for (let i = 0; i < tpLegs.length; i++) {
    const tp = tpLegs[i];
    const legKey = tpLegs.length === 1 ? idempotencyKey : `${idempotencyKey}:leg${i}`;

    const tradeInsert: TradeInsert = {
      user_id:              userId,
      parsed_signal_id:     parsedSignalId,
      broker_connection_id: brokerConnectionId,
      symbol:               parsed.symbol,
      side:                 effSide,
      volume:               legVolume,
      sl:                   placedSl,
      tp:                   tp ?? undefined,
      status:               "PENDING",
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tradeRows, error: tradeErr } = await (db as any)
      .from("trades")
      .insert(tradeInsert)
      .select("id");

    if (tradeErr) {
      console.error(`${tag} leg ${i} insert error:`, tradeErr);
      continue;
    }

    const tradeId = (tradeRows as { id: string }[])[0]!.id;
    console.log(`${tag} leg ${i} trade created (id=${shortId(tradeId)} tp=${tp ?? "none"})`);

    const req: OrderRequest = {
      connectionId: brokerConnectionId,
      symbol:       resolvedSymbol,
      side:         effSide,
      orderType,
      volume:       legVolume,
      entryPrice,
      sl:           placedSl,
      tp:           tp ?? undefined,
      clientOrderId: legKey,
      comment:      "VouchFX",
    };

    let fillPrice = 0;
    let brokerId = "";
    let openTime = new Date();

    try {
      const result = await executor.placeOrder(req);
      fillPrice = result.fillPrice;
      brokerId = result.brokerId;
      openTime = result.openTime;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from("trades").update({
        broker_order_id: brokerId,
        entry_price: fillPrice > 0 ? fillPrice : null,
        status: "OPEN",
        opened_at: openTime.toISOString(),
      }).eq("id", tradeId);

      console.log(`${tag} leg ${i} filled: broker_id=${brokerId} price=${fillPrice}`);
    } catch (err) {
      // MetaApi ValidationError carries the offending fields in .details
      const details = (err as { details?: unknown }).details;
      const errMsg = String(err) + (details !== undefined ? ` — ${JSON.stringify(details)}` : "");
      console.error(`${tag} leg ${i} placement failed:`, errMsg);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from("trades").update({ status: "SKIPPED", skip_reason: errMsg }).eq("id", tradeId);
      await writeAuditEvent(db, { userId, eventType: "error", parsedSignalId, tradeId, payload: { error: errMsg, leg: i } });
    }
  }

  await writeAuditEvent(db, {
    userId,
    eventType: "executed",
    parsedSignalId,
    payload: {
      symbol: parsed.symbol,
      side: effSide,
      legs: tpLegs.length,
      tps: effTps,
      sl: effSl,
      resolved_symbol: resolvedSymbol,
      volume: legVolume,
      dollar_risk: gateResult.dollarRisk,
      account_balance: accountBalance,
      ...(overrides.reverse ? { reversed: true, original_side: parsed.side } : {}),
      ...(overrides.riskPct !== null ? { channel_risk_pct: overrides.riskPct } : {}),
    },
  });

  notifyAsync(
    db, userId, "trade_opened",
    `${effSide} ${parsed.symbol} opened${overrides.reverse ? " (reversed)" : ""}`,
    `${tpLegs.length} leg${tpLegs.length > 1 ? "s" : ""} · vol ${legVolume} · risk $${gateResult.dollarRisk.toFixed(2)}`
  );
}

// ── Pre-classified cancel jobs ────────────────────────────────────────────────

/**
 * Handle a cancel job emitted by the listener when a Telegram message is
 * deleted. Bypasses the Claude parser — action is pre-determined:
 *   PENDING order  → cancelPending (delete the unfilled order)
 *   Filled/OPEN    → closePosition (already filled; user policy: close it)
 */
async function handleCancelJob(
  job: Job<SignalJobData>,
  deps: WorkerDeps
): Promise<void> {
  const { idempotencyKey, cancelTargetSignalId, userId, brokerConnectionId } = job.data;
  const tag = `[${idempotencyKey}]`;

  if (!cancelTargetSignalId) {
    console.log(`${tag} cancel job missing cancelTargetSignalId — skipping`);
    return;
  }

  console.log(`${tag} cancel job for signal=${cancelTargetSignalId.slice(0, 8)}`);

  await writeAuditEvent(deps.db, {
    userId,
    eventType: "received",
    parsedSignalId: cancelTargetSignalId,
    payload: { idempotency_key: idempotencyKey, source: "telegram_delete" },
  });

  const activeTrades = await findActiveTradesBySignalId(deps.db, cancelTargetSignalId, brokerConnectionId);

  if (activeTrades.length === 0) {
    console.log(`${tag} cancel: no PENDING/OPEN trades on this account — already settled, skipping`);
    return;
  }

  const { metaApiAccountId, platform } = await lookupBrokerConn(deps.db, brokerConnectionId);
  const brokerConn: BrokerConnection = {
    id: brokerConnectionId,
    userId,
    metaApiAccountId,
    platform,
  };
  deps.executor.register(brokerConn);

  let cancelledCount = 0;
  let closedCount = 0;

  for (const trade of activeTrades) {
    if (!trade.broker_order_id) continue;
    const ref: TradeRef = { connectionId: brokerConn.id, brokerId: trade.broker_order_id };
    try {
      const state = await deps.executor.getState(ref);
      if (state === "FILLED") {
        await deps.executor.closePosition(ref);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (deps.db as any)
          .from("trades")
          .update({ status: "CLOSED", closed_at: new Date().toISOString() })
          .eq("id", trade.id);
        closedCount++;
        console.log(`${tag} cancel→close (already filled) ${shortId(trade.id)}`);
      } else {
        await deps.executor.cancelPending(ref);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (deps.db as any)
          .from("trades")
          .update({ status: "CANCELLED" })
          .eq("id", trade.id);
        cancelledCount++;
        console.log(`${tag} cancelled PENDING ${shortId(trade.id)}`);
      }
    } catch (err) {
      console.error(`${tag} cancel trade ${shortId(trade.id)} error:`, (err as Error).message);
      await writeAuditEvent(deps.db, {
        userId,
        eventType: "error",
        parsedSignalId: cancelTargetSignalId,
        tradeId: trade.id,
        payload: { error: (err as Error).message, source: "telegram_delete" },
      });
    }
  }

  await writeAuditEvent(deps.db, {
    userId,
    eventType: "cancelled",
    parsedSignalId: cancelTargetSignalId,
    payload: { source: "telegram_delete", cancelled: cancelledCount, closed: closedCount },
  });
}

// ── Main job processor ────────────────────────────────────────────────────────

async function processJob(
  job: Job<SignalJobData>,
  deps: WorkerDeps
): Promise<void> {
  const { db, anthropic, executor } = deps;
  // ── 0. Cancel fast-path (pre-classified by listener on message delete) ─────
  if (job.data.jobType === "cancel") {
    await handleCancelJob(job, deps);
    return;
  }

  const { idempotencyKey, messageId, editVersion, text, sourceId, userId, brokerConnectionId, imageBase64 } =
    job.data;
  const tag = `[${idempotencyKey}]`;

  // ── 1. Audit: received ────────────────────────────────────────────────────
  console.log(`${tag} received`);
  await writeAuditEvent(db, {
    userId,
    eventType: "received",
    payload: { idempotency_key: idempotencyKey, message_id: messageId, edit_version: editVersion, raw_text: text.slice(0, 500) },
  });

  // ── 1b. Plan gate ─────────────────────────────────────────────────────────
  const planGate = await checkPlanGate(db, userId);
  if (!planGate.ok) {
    console.log(`${tag} skipped by plan gate: ${planGate.reason}`);
    await writeAuditEvent(db, {
      userId,
      eventType: "skipped",
      payload: { reason: planGate.reason },
    });
    return;
  }
  const { planSignalCap } = planGate;

  // ── 2. Build prior-signal context for edits ──────────────────────────────
  // For edits (editVersion > 0), look up the original parsed_signals row so
  // the model can classify the change (MODIFY_SL, CANCEL_PENDING, etc.).
  // The original row is preserved because upsert uses ignoreDuplicates: true.
  let priorSignal: PriorSignalContext | undefined;
  if (editVersion > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prior } = await (db as any)
      .from("parsed_signals")
      .select("symbol, side, entries, sl, tps, raw_text")
      .eq("source_id", sourceId)
      .eq("telegram_message_id", messageId)
      .maybeSingle();

    if (prior) {
      priorSignal = {
        symbol: prior.symbol as string | null,
        side: prior.side as string | null,
        entries: (prior.entries as number[] | null) ?? [],
        sl: prior.sl as number | null,
        tps: (prior.tps as number[] | null) ?? [],
        rawText: prior.raw_text as string | null,
      };
      console.log(`${tag} edit detected — prior signal loaded (${priorSignal.symbol ?? "?"} ${priorSignal.side ?? "?"}) → Sonnet`);
    } else {
      console.log(`${tag} edit but no prior signal found — parsing as fresh signal with Haiku→Sonnet cascade`);
    }
  }

  // ── 3. Parse signal (with automatic model escalation) ────────────────────
  // Vision (imageBase64 present) → Sonnet directly with multimodal content.
  // Edits with prior context → Sonnet directly.
  // Fresh text signals → Haiku; if confidence < threshold, escalate to Sonnet.
  console.log(`${tag} parsing${imageBase64 ? " (vision)" : ""}...`);
  const { signal: parsed, modelUsed } = await parseSignalWithEscalation(anthropic, text, priorSignal, imageBase64);
  console.log(`${tag} parsed: is_signal=${parsed.is_signal} confidence=${parsed.confidence.toFixed(2)} symbol=${parsed.symbol ?? "-"} follow_up=${parsed.follow_up_type ?? "none"} model=${modelUsed}`);

  const parsedPayload = {
    is_signal: parsed.is_signal,
    symbol: parsed.symbol,
    side: parsed.side,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    follow_up_type: parsed.follow_up_type,
    model: modelUsed,
    escalated: modelUsed !== MODELS.default,
    edit_version: editVersion,
    vision: Boolean(imageBase64),
  };

  // Follow-ups (move-to-BE, modify SL/TP, close, cancel) manage an EXISTING
  // trade. They legitimately parse with is_signal=false and sub-threshold
  // confidence, so they must bypass the new-signal gates below and route to
  // dispatchFollowUp instead of being dropped as "not a signal".
  const followUpType = parsed.follow_up_type ?? "NEW_SIGNAL";
  const isFollowUp = followUpType !== "NEW_SIGNAL" && followUpType !== "IGNORE";

  // ── 4. Genuine non-signals (chit-chat / IGNORE) — nothing to act on ────────
  if (!parsed.is_signal && !isFollowUp) {
    console.log(`${tag} skipped: not a signal`);
    await writeAuditEvent(db, { userId, eventType: "parsed", payload: parsedPayload });
    await writeAuditEvent(db, { userId, eventType: "skipped", payload: { reason: "not_a_signal" } });
    return;
  }

  // ── 5. Persist the parsed_signal NOW — BEFORE the confidence gate — so every
  //    real parsed signal has a reviewable audit trail (VCH-PRS-04), and the
  //    "parsed"/"skipped" activity items can deep-link to it.
  const psInsert: ParsedSignalInsert = {
    source_id: sourceId,
    telegram_message_id: messageId,
    edit_version: editVersion,
    raw_text: text,
    is_signal: parsed.is_signal,
    symbol: parsed.symbol,
    side: parsed.side,
    order_type: parsed.order_type,
    entries: parsed.entries,
    sl: parsed.sl,
    sl_unit: parsed.sl_unit,
    tps: parsed.tps,
    tp_unit: parsed.tp_unit,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    follow_up_type: parsed.follow_up_type ?? "NEW_SIGNAL",
    language_detected: parsed.language_detected,
    model_used: MODELS.default,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: psRows, error: psError } = await (db as any)
    .from("parsed_signals")
    .upsert(psInsert, { onConflict: "source_id,telegram_message_id", ignoreDuplicates: true })
    .select("id");

  if (psError) throw new Error(`[worker] parsed_signal upsert: ${JSON.stringify(psError)}`);

  let parsedSignalId: string;
  if (Array.isArray(psRows) && psRows.length > 0) {
    parsedSignalId = (psRows[0] as { id: string }).id;
  } else {
    // Conflict — fetch existing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (db as any)
      .from("parsed_signals").select("id")
      .eq("source_id", sourceId).eq("telegram_message_id", messageId).single();
    if (!existing) throw new Error(`[worker] could not resolve parsed_signal id`);
    parsedSignalId = (existing as { id: string }).id;
    console.log(`${tag} parsed_signal already persisted (id=${shortId(parsedSignalId)})`);
  }

  // ── 6. Audit: parsed (now carries the signal id for deep-linking) ─────────
  await writeAuditEvent(db, { userId, eventType: "parsed", parsedSignalId, payload: parsedPayload });

  // ── 7. Broker connection + per-channel settings (needed for both paths) ───
  const [brokerLookup, sourceResult] = await Promise.all([
    lookupBrokerConn(db, brokerConnectionId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from("signal_sources")
      .select("override_risk_enabled, override_risk_pct, sl_policy, reverse_trades")
      .eq("id", sourceId)
      .maybeSingle(),
  ]);

  const { metaApiAccountId, platform } = brokerLookup;
  const brokerConn: BrokerConnection = {
    id: brokerConnectionId,
    userId,
    metaApiAccountId,
    platform,
  };
  executor.register(brokerConn);

  const sourceRow = sourceResult.data as {
    override_risk_enabled: boolean | null;
    override_risk_pct: number | null;
    sl_policy: "require" | "apply_default" | null;
    reverse_trades: boolean | null;
  } | null;

  const sourceOverrides: SourceOverrides = {
    riskPct:
      sourceRow?.override_risk_enabled && typeof sourceRow.override_risk_pct === "number" && sourceRow.override_risk_pct > 0
        ? sourceRow.override_risk_pct
        : null,
    slPolicy: sourceRow?.sl_policy ?? null,
    reverse: sourceRow?.reverse_trades === true,
  };

  // ── 8. Route: follow-up (manage existing trade) or new signal ─────────────
  if (isFollowUp) {
    // The new-signal confidence threshold does NOT apply here — dispatchFollowUp's
    // trade-matching (reply-reference / symbol / channel) is the real guard.
    await dispatchFollowUp(tag, db, executor, brokerConn, parsed, parsedSignalId, userId, sourceId);
    return;
  }

  // New signal: enforce the confidence threshold before placing anything.
  if (parsed.confidence < CONFIDENCE_THRESHOLD) {
    const reason = `confidence_${parsed.confidence.toFixed(2)}_below_${CONFIDENCE_THRESHOLD}`;
    console.log(`${tag} skipped: ${reason}`);
    await writeAuditEvent(db, { userId, eventType: "skipped", parsedSignalId, payload: { reason, confidence: parsed.confidence } });
    return;
  }

  await executeNewSignal(tag, db, executor, brokerConn, parsed, parsedSignalId, userId, brokerConnectionId, sourceId, idempotencyKey, planSignalCap, sourceOverrides);
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function createWorker(redis: Redis, deps: WorkerDeps): Worker<SignalJobData> {
  return new Worker<SignalJobData>(
    QUEUE_NAME,
    (job) => processJob(job, deps),
    { connection: redis, concurrency: 1 }
  );
}
