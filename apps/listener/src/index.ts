// MUST be first: loads .env before @vouchfx/config's parseEnv() singleton runs.
import "./load-env";
import http from "http";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { parseEnv } from "@vouchfx/config";
import { type SignalJobData, createLogger } from "@vouchfx/core";
import { initSentry, captureException, startHeartbeat } from "@vouchfx/core/monitoring";
import { createAdminClientFromEnv } from "@vouchfx/db";
import { UserPool } from "./pool";

const env = parseEnv();
const log = createLogger("listener");

initSentry(env.SENTRY_DSN, `listener@${env.NODE_ENV}`);

log.info("starting", { NODE_ENV: env.NODE_ENV });

const QUEUE_NAME = "vouchfx-signals";
const SYNC_INTERVAL_MS = 30_000;

const required: [string, unknown][] = [
  ["TELEGRAM_API_ID", env.TELEGRAM_API_ID],
  ["TELEGRAM_API_HASH", env.TELEGRAM_API_HASH],
  ["SUPABASE_URL", env.SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY],
  ["ENCRYPTION_KEY", env.ENCRYPTION_KEY],
];
const missing = required.filter(([, v]) => !v).map(([k]) => k);
if (missing.length > 0) {
  log.error("missing required env vars", { missing });
  process.exit(1);
}

const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue<SignalJobData, void, string>(QUEUE_NAME, { connection: redis });
redis.on("error", (err) => log.error("redis error", { error: (err as Error).message }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createAdminClientFromEnv(env) as any;

// ── Health check server (VCH-ADM-02) ─────────────────────────────────────────
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT ?? "3002", 10);
const STALE_MS = 60_000;
const WORKER_ID = process.env.FLY_MACHINE_ID ?? `listener-${Date.now()}`;
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

(async () => {
  const pool = new UserPool(queue);
  await pool.start();

  log.info("running — syncing every 30s");

  // Heartbeat (VCH-ADM-02)
  const stopHeartbeat = startHeartbeat(db, WORKER_ID, "listener", { version: env.NODE_ENV });
  const heartbeatTimer = setInterval(() => { lastHeartbeatAt = Date.now(); }, 30_000);

  const syncInterval = setInterval(async () => {
    try {
      await pool.sync();
    } catch (err) {
      log.error("sync error", { error: (err as Error).message });
      captureException(err);
    }
  }, SYNC_INTERVAL_MS);

  async function shutdown(): Promise<void> {
    log.info("shutting down");
    stopHeartbeat();
    clearInterval(heartbeatTimer);
    clearInterval(syncInterval);
    await pool.shutdown();
    await queue.close();
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
})().catch((err: unknown) => {
  log.error("fatal error", { error: (err as Error).message });
  captureException(err);
  process.exit(1);
});
