import { Queue } from "bullmq";
import Redis from "ioredis";
import { parseEnv } from "@vouchfx/config";
import { type SignalJobData } from "@vouchfx/core";
import { UserPool } from "./pool";

const env = parseEnv();
const QUEUE_NAME = "vouchfx:signals";
const SYNC_INTERVAL_MS = 30_000; // poll for new/removed sessions every 30s

console.log(`[listener] starting — NODE_ENV=${env.NODE_ENV}`);

if (!env.TELEGRAM_API_ID || !env.TELEGRAM_API_HASH) {
  console.error("[listener] fatal: TELEGRAM_API_ID and TELEGRAM_API_HASH are required");
  process.exit(1);
}
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[listener] fatal: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}
if (!env.ENCRYPTION_KEY) {
  console.error("[listener] fatal: ENCRYPTION_KEY is required");
  process.exit(1);
}

const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue<SignalJobData, void, string>(QUEUE_NAME, { connection: redis });
redis.on("error", (err) => console.error("[listener] redis error:", err));

(async () => {
  const pool = new UserPool(queue);

  await pool.start();

  console.log("[listener] running — syncing every 30s. Press Ctrl+C to stop.");

  const syncInterval = setInterval(async () => {
    try {
      await pool.sync();
    } catch (err) {
      console.error("[listener] sync error:", (err as Error).message);
    }
  }, SYNC_INTERVAL_MS);

  async function shutdown(): Promise<void> {
    console.log("\n[listener] shutting down");
    clearInterval(syncInterval);
    await pool.shutdown();
    await queue.close();
    redis.disconnect();
    process.exit(0);
  }

  process.on("SIGINT", () => { shutdown().catch(console.error); });
  process.on("SIGTERM", () => { shutdown().catch(console.error); });
})().catch((err: unknown) => {
  console.error("[listener] fatal error:", err);
  process.exit(1);
});
