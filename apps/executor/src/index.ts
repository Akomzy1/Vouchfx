/**
 * Executor entry point.
 *
 * Starts a BullMQ Worker that consumes "vouchfx-signals" jobs produced by the
 * listener. MetaApi account IDs are looked up per-job from broker_connections —
 * no hardcoded spike account is needed.
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY, METAAPI_TOKEN,
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REDIS_URL
 *
 * Run:  pnpm --filter @vouchfx/executor dev
 */

// MUST be first: loads .env before @vouchfx/config's parseEnv() singleton runs.
import "./load-env";
import http from "http";
import Anthropic from "@anthropic-ai/sdk";
import Redis from "ioredis";
import { parseEnv } from "@vouchfx/config";
import { MetaApiExecutor } from "@vouchfx/core/executor";
import { createLogger } from "@vouchfx/core";
import { initSentry, captureException, startHeartbeat } from "@vouchfx/core/monitoring";
import { createAdminClientFromEnv } from "@vouchfx/db";
import { createWorker } from "./worker";
import { startRuleMonitorSchedule } from "./rule-monitor";
import { startCalendarSchedule } from "./calendar";
import { startCommissionSweep } from "./commission";
import { startBalanceSync } from "./balance-sync";

const env = parseEnv();
const log = createLogger("executor");

// Sentry: no-op when SENTRY_DSN is absent (VCH-ADM-03).
initSentry(env.SENTRY_DSN, `executor@${env.NODE_ENV}`);

log.info("starting", { NODE_ENV: env.NODE_ENV });

// ── Guard: require all mandatory env vars ─────────────────────────────────────
const missing: string[] = [];
if (!env.ANTHROPIC_API_KEY)         missing.push("ANTHROPIC_API_KEY");
if (!env.METAAPI_TOKEN)             missing.push("METAAPI_TOKEN");
if (!env.SUPABASE_URL)              missing.push("SUPABASE_URL");
if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");

if (missing.length > 0) {
  log.error("missing required env vars", { missing });
  process.exit(1);
}

// ── Dependencies ──────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const metaApiExecutor = new MetaApiExecutor(env.METAAPI_TOKEN!);
const db = createAdminClientFromEnv(env);

// maxRetriesPerRequest: null is required by BullMQ Worker for blocking commands
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
redis.on("error", (err) => log.error("redis error", { error: (err as Error).message }));

// ── Heartbeat (VCH-ADM-02) ────────────────────────────────────────────────────
// FLY_MACHINE_ID is set by Fly.io automatically; fall back to a timestamp-based ID.
const WORKER_ID = process.env.FLY_MACHINE_ID ?? `executor-${Date.now()}`;
let stopHeartbeat: (() => void) | null = null;

// ── Health check server (VCH-ADM-02) ─────────────────────────────────────────
// Fly.io calls GET /health every 30s; returns 503 if last heartbeat is > 60s old.
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT ?? "3001", 10);
const STALE_MS = 60_000;
let lastHeartbeatAt = Date.now();

const healthServer = http.createServer((_req, res) => {
  const age = Date.now() - lastHeartbeatAt;
  if (age > STALE_MS) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, stale_ms: age }));
  } else {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, age_ms: age, worker_id: WORKER_ID }));
  }
});
healthServer.listen(HEALTH_PORT, () => {
  log.info("health check server listening", { port: HEALTH_PORT });
});

// ── Start worker ──────────────────────────────────────────────────────────────
const worker = createWorker(redis, {
  db,
  anthropic,
  executor: metaApiExecutor,
});

// ── Rule Monitor (VCH-PROP-11) ────────────────────────────────────────────────
// Fetches each firm's rules page on a schedule and records change proposals.
// Interval defaults to 24 h; override with RULE_MONITOR_INTERVAL_MS env var.
const ruleMonitorInterval = parseInt(process.env.RULE_MONITOR_INTERVAL_MS ?? "", 10) || undefined;
const stopRuleMonitor = startRuleMonitorSchedule(
  { db, anthropic, log, resendApiKey: env.RESEND_API_KEY ?? null },
  ruleMonitorInterval,
);

// ── Economic-calendar sync (VCH-RSK-06b/06c) ─────────────────────────────────
// Hourly tick; the actual fetches are rate-guarded via calendar_fetch_log
// (JBlanked: 1 request/day; ForexFactory fallback: only when cache >48h stale,
// ≤1 request per 5 minutes). Fail-safe transitions alert ADMIN_EMAILS.
const stopCalendar = startCalendarSchedule({
  db,
  log,
  jblankedApiKey: env.JBLANKED_API_KEY ?? null,
  resendApiKey: env.RESEND_API_KEY ?? null,
  adminEmails: env.ADMIN_EMAILS ?? null,
});

// Mature referral/affiliate commissions past their 14-day refund window.
const stopCommissionSweep = startCommissionSweep(db, log);

// Keep the dashboard's cached broker balance/equity fresh between signals.
const stopBalanceSync = startBalanceSync(db, metaApiExecutor, log);

worker.on("completed", (job) => {
  log.info("job completed", { jobId: job.id });
});

worker.on("failed", (job, err) => {
  log.error("job failed", { jobId: job?.id, error: (err as Error).message });
  captureException(err, { jobId: job?.id });
});

worker.on("error", (err) => {
  log.error("worker error", { error: (err as Error).message });
  captureException(err);
});

log.info("worker started — listening for jobs");

// ── Start heartbeat after worker is up ────────────────────────────────────────
stopHeartbeat = startHeartbeat(db, WORKER_ID, "executor", { version: env.NODE_ENV });
// Keep local timestamp in sync so health check can run without a DB round-trip.
const heartbeatTimer = setInterval(() => { lastHeartbeatAt = Date.now(); }, 30_000);

// ── Kill-switch poller ────────────────────────────────────────────────────────
// Runs every 30 s. Finds signal_sources with kill_close_requested_at set,
// closes all PENDING/OPEN trades from each, then hard-deletes the source row.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any;
async function processKillCloseRequests(): Promise<void> {
  const { data: sources } = await dbAny
    .from("signal_sources")
    .select("id, user_id, telegram_chat_id")
    .not("kill_close_requested_at", "is", null);
  if (!sources || sources.length === 0) return;

  for (const src of sources as { id: string; user_id: string; telegram_chat_id: string }[]) {
    const tag = `[kill-close ${src.id.slice(0, 8)}]`;
    try {
      // Find the user's primary active broker connection (oldest active as
      // the deterministic fallback) — matches the listener's routing order.
      const { data: connRow } = await dbAny
        .from("broker_connections")
        .select("id, metaapi_account_id, platform")
        .eq("user_id", src.user_id)
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (connRow) {
        const brokerConn = {
          id: connRow.id as string,
          userId: src.user_id,
          metaApiAccountId: connRow.metaapi_account_id as string,
          platform: (connRow.platform ?? "MT5") as "MT5" | "MT4",
        };
        metaApiExecutor.register(brokerConn);

        // Find all open/pending trades from this source
        const { data: trades } = await dbAny
          .from("trades")
          .select("id, broker_order_id, status")
          .eq("user_id", src.user_id)
          .eq("broker_connection_id", connRow.id)
          .in("status", ["PENDING", "OPEN"])
          .in(
            "parsed_signal_id",
            dbAny
              .from("parsed_signals")
              .select("id")
              .eq("source_id", src.id)
          );

        let closed = 0;
        for (const t of (trades ?? []) as { id: string; broker_order_id: string | null; status: string }[]) {
          if (!t.broker_order_id) continue;
          const ref = { connectionId: brokerConn.id, brokerId: t.broker_order_id };
          try {
            if (t.status === "PENDING") {
              await metaApiExecutor.cancelPending(ref);
              await dbAny.from("trades").update({ status: "CANCELLED" }).eq("id", t.id);
            } else {
              await metaApiExecutor.closePosition(ref);
              await dbAny.from("trades").update({ status: "CLOSED", closed_at: new Date().toISOString() }).eq("id", t.id);
            }
            closed++;
          } catch (err) {
            log.error(`${tag} failed to close trade ${t.id.slice(0, 8)}`, { error: (err as Error).message });
          }
        }
        log.info(`${tag} closed ${closed} trade(s)`);
      }

      // Hard-delete the source (cascades to parsed_signals + trades via FK)
      await dbAny.from("signal_sources").delete().eq("id", src.id);
      log.info(`${tag} source deleted`);
    } catch (err) {
      log.error(`${tag} kill-close error`, { error: (err as Error).message });
    }
  }
}

const killPollTimer = setInterval(() => {
  processKillCloseRequests().catch((err) =>
    log.error("kill-close poll error", { error: (err as Error).message })
  );
}, 30_000);

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(): Promise<void> {
  log.info("shutting down");
  stopHeartbeat?.();
  stopRuleMonitor();
  stopCalendar();
  stopCommissionSweep();
  stopBalanceSync();
  clearInterval(heartbeatTimer);
  clearInterval(killPollTimer);
  await worker.close();
  metaApiExecutor.close();
  redis.disconnect();
  healthServer.close();
  process.exit(0);
}

process.on("SIGINT", () => { shutdown().catch((e) => log.error("shutdown error", { error: (e as Error).message })); });
process.on("SIGTERM", () => { shutdown().catch((e) => log.error("shutdown error", { error: (e as Error).message })); });
process.on("uncaughtException", (err) => {
  log.error("uncaught exception", { error: err.message });
  captureException(err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  log.error("unhandled rejection", { reason: String(reason) });
  captureException(reason);
});
