/**
 * BullMQ worker — consumes "vouchfx:signals" jobs.
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

import Anthropic from "@anthropic-ai/sdk";
import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { CONFIDENCE_THRESHOLD, MODELS } from "@vouchfx/config";
import {
  parseSignalWithEscalation,
  MetaApiExecutor,
  type BrokerConnection,
  type OrderRequest,
  type TradeRef,
  type SignalJobData,
  type ParsedSignal,
  type PriorSignalContext,
} from "@vouchfx/core";
import {
  writeAuditEvent,
  type TypedClient,
  type ParsedSignalInsert,
  type TradeInsert,
  type TradeRow,
} from "@vouchfx/db";

/** Spike: fixed lot size per leg. Risk engine (P1.14) supplies the real volume. */
const SPIKE_LEG_VOLUME = 0.01;

const QUEUE_NAME = "vouchfx:signals";

export interface WorkerDeps {
  db: TypedClient;
  anthropic: Anthropic;
  executor: MetaApiExecutor;
  spikeMetaApiAccountId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Look up active trade legs via a follow-up reference to the originating message. */
async function findActiveTrades(
  db: TypedClient,
  sourceId: string,
  priorMessageId: number
): Promise<TradeRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: origPs } = await (db as any)
    .from("parsed_signals")
    .select("id")
    .eq("source_id", sourceId)
    .eq("telegram_message_id", priorMessageId)
    .maybeSingle();

  if (!origPs) return [];
  return findActiveTradesBySignalId(db, (origPs as { id: string }).id);
}

/** Look up active trade legs directly by parsed_signal_id — used by cancel jobs. */
async function findActiveTradesBySignalId(
  db: TypedClient,
  parsedSignalId: string
): Promise<TradeRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from("trades")
    .select("*")
    .eq("parsed_signal_id", parsedSignalId)
    .in("status", ["PENDING", "OPEN"]);
  return (data ?? []) as TradeRow[];
}

/**
 * Fallback for free-text follow-ups (e.g., "close XAUUSD", "scrap it"):
 * when the model sets references_prior_trade but has no message_id reference,
 * match by user_id + normalised symbol across all active trades.
 */
async function findActiveTradesBySymbol(
  db: TypedClient,
  userId: string,
  symbol: string
): Promise<TradeRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from("trades")
    .select("*")
    .eq("user_id", userId)
    .eq("symbol", symbol)
    .in("status", ["PENDING", "OPEN"]);
  return (data ?? []) as TradeRow[];
}

// ── Follow-up dispatch ────────────────────────────────────────────────────────

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
    activeTrades = await findActiveTrades(db, sourceId, references_prior_message_id);
    matchMethod = `msg_id=${references_prior_message_id}`;
  } else if (parsed.references_prior_trade && parsed.symbol) {
    activeTrades = await findActiveTradesBySymbol(db, userId, parsed.symbol);
    matchMethod = `symbol=${parsed.symbol}`;
  } else {
    console.log(`${tag} follow-up ${follow_up_type} — no message reference and no symbol, skipping`);
    await writeAuditEvent(db, { userId, eventType: "skipped", parsedSignalId, payload: { reason: "follow_up_no_reference" } });
    return;
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
      for (const trade of activeTrades) {
        if (!trade.broker_order_id) continue;
        const ref: TradeRef = { connectionId: brokerConn.id, brokerId: trade.broker_order_id };
        await executor.modifyOrder(ref, { sl: parsed.sl });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).from("trades").update({ sl: parsed.sl }).eq("id", trade.id);
        console.log(`${tag} MODIFY_SL ${shortId(trade.id)} sl→${parsed.sl}`);
      }
      await writeAuditEvent(db, { userId, eventType: "modified", parsedSignalId, payload: { follow_up_type, new_sl: parsed.sl, legs: activeTrades.length } });
      break;
    }

    case "MODIFY_TP": {
      if (!parsed.tps.length) {
        await writeAuditEvent(db, { userId, eventType: "skipped", parsedSignalId, payload: { reason: "MODIFY_TP_no_tp_value" } });
        return;
      }
      // Assign new TPs round-robin across legs (most common case: 1 new TP for 1 leg)
      for (let i = 0; i < activeTrades.length; i++) {
        const trade = activeTrades[i]!;
        if (!trade.broker_order_id) continue;
        const newTp = parsed.tps[i % parsed.tps.length]!;
        const ref: TradeRef = { connectionId: brokerConn.id, brokerId: trade.broker_order_id };
        await executor.modifyOrder(ref, { tp: newTp });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).from("trades").update({ tp: newTp }).eq("id", trade.id);
        console.log(`${tag} MODIFY_TP ${shortId(trade.id)} tp→${newTp}`);
      }
      await writeAuditEvent(db, { userId, eventType: "modified", parsedSignalId, payload: { follow_up_type, new_tps: parsed.tps, legs: activeTrades.length } });
      break;
    }

    case "MOVE_TO_BE": {
      for (const trade of activeTrades) {
        if (!trade.broker_order_id || !trade.entry_price) continue;
        const ref: TradeRef = { connectionId: brokerConn.id, brokerId: trade.broker_order_id };
        await executor.modifyOrder(ref, { sl: trade.entry_price });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).from("trades").update({ sl: trade.entry_price }).eq("id", trade.id);
        console.log(`${tag} MOVE_TO_BE ${shortId(trade.id)} sl→entry ${trade.entry_price}`);
      }
      await writeAuditEvent(db, { userId, eventType: "modified", parsedSignalId, payload: { follow_up_type, legs: activeTrades.length } });
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

// ── New-signal execution (multi-TP) ──────────────────────────────────────────

async function executeNewSignal(
  tag: string,
  db: TypedClient,
  executor: MetaApiExecutor,
  brokerConn: BrokerConnection,
  parsed: ParsedSignal,
  parsedSignalId: string,
  userId: string,
  brokerConnectionId: string,
  idempotencyKey: string
): Promise<void> {
  if (!parsed.symbol || !parsed.side) {
    console.log(`${tag} skipped: symbol or side missing`);
    await writeAuditEvent(db, { userId, eventType: "skipped", parsedSignalId, payload: { reason: "missing_symbol_or_side" } });
    return;
  }

  // ── Idempotency pre-check ────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (db as any)
    .from("trades")
    .select("*", { count: "exact", head: true })
    .eq("parsed_signal_id", parsedSignalId)
    .in("status", ["PENDING", "OPEN"]);

  if (count && count > 0) {
    console.log(`${tag} idempotency: ${count} active leg(s) already exist — skipping`);
    await writeAuditEvent(db, { userId, eventType: "skipped", parsedSignalId, payload: { reason: "trade_legs_already_exist", count } });
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

  // ── Build TP legs ────────────────────────────────────────────────────────
  // Each TP → one trade leg. No TPs → one leg without a TP target.
  const tpLegs: (number | null)[] = parsed.tps.length > 0 ? parsed.tps : [null];

  console.log(`${tag} placing ${tpLegs.length} leg(s) on ${resolvedSymbol}`);

  for (let i = 0; i < tpLegs.length; i++) {
    const tp = tpLegs[i];
    const legKey = tpLegs.length === 1 ? idempotencyKey : `${idempotencyKey}:leg${i}`;

    // Insert trade row with PENDING status
    const tradeInsert: TradeInsert = {
      user_id: userId,
      parsed_signal_id: parsedSignalId,
      broker_connection_id: brokerConnectionId,
      symbol: parsed.symbol,
      side: parsed.side,
      volume: SPIKE_LEG_VOLUME,
      sl: parsed.sl ?? undefined,
      tp: tp ?? undefined,
      status: "PENDING",
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

    // Place order
    const req: OrderRequest = {
      connectionId: brokerConnectionId,
      symbol: resolvedSymbol,
      side: parsed.side,
      orderType: "MARKET",
      volume: SPIKE_LEG_VOLUME,
      sl: parsed.sl ?? undefined,
      tp: tp ?? undefined,
      clientOrderId: legKey,
      comment: "VouchFX",
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
      const errMsg = String(err);
      console.error(`${tag} leg ${i} placement failed:`, errMsg);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from("trades").update({ status: "SKIPPED", skip_reason: errMsg }).eq("id", tradeId);
      await writeAuditEvent(db, { userId, eventType: "error", parsedSignalId, tradeId, payload: { error: errMsg, leg: i } });
    }
  }

  // Audit the overall execution
  await writeAuditEvent(db, {
    userId,
    eventType: "executed",
    parsedSignalId,
    payload: {
      symbol: parsed.symbol,
      side: parsed.side,
      legs: tpLegs.length,
      tps: parsed.tps,
      sl: parsed.sl,
      resolved_symbol: resolvedSymbol,
    },
  });
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

  const activeTrades = await findActiveTradesBySignalId(deps.db, cancelTargetSignalId);

  if (activeTrades.length === 0) {
    console.log(`${tag} cancel: no PENDING/OPEN trades — already settled, skipping`);
    return;
  }

  const brokerConn: BrokerConnection = {
    id: brokerConnectionId,
    userId,
    metaApiAccountId: deps.spikeMetaApiAccountId,
    platform: "MT5",
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
  const { db, anthropic, executor, spikeMetaApiAccountId } = deps;
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

  // ── 4. Audit: parsed ──────────────────────────────────────────────────────
  await writeAuditEvent(db, {
    userId,
    eventType: "parsed",
    payload: {
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
    },
  });

  // ── 5. Gate: must be a signal with sufficient confidence ──────────────────
  if (!parsed.is_signal) {
    console.log(`${tag} skipped: not a signal`);
    await writeAuditEvent(db, { userId, eventType: "skipped", payload: { reason: "not_a_signal" } });
    return;
  }
  if (parsed.confidence < CONFIDENCE_THRESHOLD) {
    const reason = `confidence_${parsed.confidence.toFixed(2)}_below_${CONFIDENCE_THRESHOLD}`;
    console.log(`${tag} skipped: ${reason}`);
    await writeAuditEvent(db, { userId, eventType: "skipped", payload: { reason, confidence: parsed.confidence } });
    return;
  }

  // ── 6. Upsert parsed_signal ───────────────────────────────────────────────
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

  // ── 7. Broker connection ──────────────────────────────────────────────────
  const brokerConn: BrokerConnection = {
    id: brokerConnectionId,
    userId,
    metaApiAccountId: spikeMetaApiAccountId,
    platform: "MT5",
  };
  executor.register(brokerConn);

  // ── 8. Route: follow-up or new signal ────────────────────────────────────
  const followUpType = parsed.follow_up_type;

  if (followUpType && followUpType !== "NEW_SIGNAL") {
    await dispatchFollowUp(tag, db, executor, brokerConn, parsed, parsedSignalId, userId, sourceId);
  } else {
    await executeNewSignal(tag, db, executor, brokerConn, parsed, parsedSignalId, userId, brokerConnectionId, idempotencyKey);
  }
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function createWorker(redis: Redis, deps: WorkerDeps): Worker<SignalJobData> {
  return new Worker<SignalJobData>(
    QUEUE_NAME,
    (job) => processJob(job, deps),
    { connection: redis, concurrency: 1 }
  );
}
