import { Queue } from "bullmq";
import Redis from "ioredis";
import { parseEnv } from "@vouchfx/config";
import { type SignalJobData } from "@vouchfx/core";
import { createReadonlyClient, startListening } from "./listener";

const env = parseEnv();

// ── Spike constants — replaced by DB lookups in P1.4 ─────────────────────────
const SPIKE_USER_ID              = "00000000-0000-0000-0000-000000000000";
const SPIKE_BROKER_CONNECTION_ID = "00000000-0000-0000-0000-000000000001";
const SPIKE_SOURCE_ID            = "00000000-0000-0000-0000-000000000002";
const QUEUE_NAME                 = "vouchfx:signals";

console.log(`[listener] starting — NODE_ENV=${env.NODE_ENV}`);

// ── Guard: require spike config ───────────────────────────────────────────────
if (!env.TELEGRAM_API_ID || !env.TELEGRAM_API_HASH || !env.TELEGRAM_SESSION_STRING) {
  console.error(
    "[listener] fatal: TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_SESSION_STRING are required.\n" +
      "  Generate a session string: pnpm --filter @vouchfx/listener exec tsx src/auth.ts"
  );
  process.exit(1);
}

if (!env.TELEGRAM_SPIKE_CHAT_ID) {
  console.error(
    "[listener] fatal: TELEGRAM_SPIKE_CHAT_ID is required for the Phase-0 spike.\n" +
      '  Set it to the channel chat id, e.g. TELEGRAM_SPIKE_CHAT_ID="-1001234567890"'
  );
  process.exit(1);
}

const spikeChatId = BigInt(env.TELEGRAM_SPIKE_CHAT_ID);

// ── Redis + BullMQ queue ──────────────────────────────────────────────────────
// maxRetriesPerRequest: null is required by BullMQ for blocking commands
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue<SignalJobData, void, string>(QUEUE_NAME, { connection: redis });

redis.on("error", (err) => console.error("[listener] redis error:", err));

const client = createReadonlyClient(
  env.TELEGRAM_API_ID,
  env.TELEGRAM_API_HASH,
  env.TELEGRAM_SESSION_STRING
);

(async () => {
  await startListening(client, spikeChatId, async (idempotencyKey, text, hasMedia) => {
    // Parse the component parts from the key: "<chatId>:<messageId>:<editVersion>"
    const parts = idempotencyKey.split(":");
    const chatId = parts[0]!;
    const messageId = parseInt(parts[1]!, 10);
    const editVersion = parseInt(parts[2]!, 10);

    const jobData: SignalJobData = {
      idempotencyKey,
      chatId,
      messageId,
      editVersion,
      text,
      hasMedia,
      sourceId: SPIKE_SOURCE_ID,
      userId: SPIKE_USER_ID,
      brokerConnectionId: SPIKE_BROKER_CONNECTION_ID,
    };

    // jobId = idempotencyKey: BullMQ ignores duplicate job ids — first delivery wins
    await queue.add("signal", jobData, {
      jobId: idempotencyKey,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    });

    console.log(`[listener] enqueued job id=${idempotencyKey} msg=${messageId} edit=${editVersion}`);
  });

  console.log("[listener] running — waiting for messages. Press Ctrl+C to stop.");

  async function shutdown(): Promise<void> {
    console.log("\n[listener] shutting down");
    await client.disconnect();
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
