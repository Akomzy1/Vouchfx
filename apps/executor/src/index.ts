/**
 * Executor entry point — P0.5.
 *
 * Starts a BullMQ Worker that consumes "vouchfx:signals" jobs produced by the
 * listener. Replaces the P0.4 spike runner.
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY, METAAPI_TOKEN, SPIKE_METAAPI_ACCOUNT_ID,
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REDIS_URL
 *
 * Run:  pnpm --filter @vouchfx/executor dev
 */

import Anthropic from "@anthropic-ai/sdk";
import Redis from "ioredis";
import { parseEnv } from "@vouchfx/config";
import { MetaApiExecutor } from "@vouchfx/core";
import { createAdminClientFromEnv } from "@vouchfx/db";
import { createWorker } from "./worker";

const env = parseEnv();

console.log(`[executor] starting — NODE_ENV=${env.NODE_ENV}`);

// ── Guard: require all mandatory env vars ─────────────────────────────────────
const missing: string[] = [];
if (!env.ANTHROPIC_API_KEY)         missing.push("ANTHROPIC_API_KEY");
if (!env.METAAPI_TOKEN)             missing.push("METAAPI_TOKEN");
if (!env.SPIKE_METAAPI_ACCOUNT_ID)  missing.push("SPIKE_METAAPI_ACCOUNT_ID");
if (!env.SUPABASE_URL)              missing.push("SUPABASE_URL");
if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");

if (missing.length > 0) {
  console.error(`[executor] fatal: missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

// ── Dependencies ──────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const metaApiExecutor = new MetaApiExecutor(env.METAAPI_TOKEN!);

const db = createAdminClientFromEnv(env);

// maxRetriesPerRequest: null is required by BullMQ Worker for blocking commands
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
redis.on("error", (err) => console.error("[executor] redis error:", err));

// ── Start worker ──────────────────────────────────────────────────────────────
const worker = createWorker(redis, {
  db,
  anthropic,
  executor: metaApiExecutor,
  spikeMetaApiAccountId: env.SPIKE_METAAPI_ACCOUNT_ID!,
});

worker.on("completed", (job) => {
  console.log(`[executor] job completed: ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`[executor] job failed: ${job?.id} —`, err);
});

worker.on("error", (err) => {
  console.error("[executor] worker error:", err);
});

console.log("[executor] worker started — listening for jobs. Press Ctrl+C to stop.");

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(): Promise<void> {
  console.log("\n[executor] shutting down");
  await worker.close();
  metaApiExecutor.close();
  redis.disconnect();
  process.exit(0);
}

process.on("SIGINT", () => { shutdown().catch(console.error); });
process.on("SIGTERM", () => { shutdown().catch(console.error); });
