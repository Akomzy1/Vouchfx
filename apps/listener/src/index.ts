import { Queue } from "bullmq";
import Redis from "ioredis";
import { parseEnv } from "@vouchfx/config";
import { type SignalJobData } from "@vouchfx/core";
import { createReadonlyClient, startListening } from "./listener";
import { loadSessionFromDb, updateSessionStatus } from "./session-manager";

const env = parseEnv();

// ── Spike constants — replaced by DB lookups in P1.4 ─────────────────────────
const SPIKE_USER_ID              = "00000000-0000-0000-0000-000000000000";
const SPIKE_BROKER_CONNECTION_ID = "00000000-0000-0000-0000-000000000001";
const SPIKE_SOURCE_ID            = "00000000-0000-0000-0000-000000000002";
const QUEUE_NAME                 = "vouchfx:signals";

console.log(`[listener] starting — NODE_ENV=${env.NODE_ENV}`);

if (!env.TELEGRAM_API_ID || !env.TELEGRAM_API_HASH) {
  console.error("[listener] fatal: TELEGRAM_API_ID and TELEGRAM_API_HASH are required");
  process.exit(1);
}

// ── Redis + BullMQ queue ──────────────────────────────────────────────────────
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue<SignalJobData, void, string>(QUEUE_NAME, { connection: redis });
redis.on("error", (err) => console.error("[listener] redis error:", err));

(async () => {
  // ── Resolve session string ─────────────────────────────────────────────────
  // P1.3+: load from DB (encrypted at rest, decrypted here in worker memory).
  // P0 fallback: use TELEGRAM_SESSION_STRING env var for the spike.
  let sessionString: string;
  let userId = SPIKE_USER_ID;

  const useDbSession =
    env.SUPABASE_URL &&
    env.SUPABASE_SERVICE_ROLE_KEY &&
    env.ENCRYPTION_KEY &&
    !env.TELEGRAM_SESSION_STRING; // env var overrides DB for backward-compat spike

  if (useDbSession) {
    console.log("[listener] loading session from database");
    try {
      // P1.4 will expand this to all users; for now, load one user for testing.
      // Set SPIKE_USER_ID to the actual user UUID, or extend via env var.
      const LISTENER_USER_ID = process.env.LISTENER_USER_ID ?? SPIKE_USER_ID;
      const loaded = await loadSessionFromDb(LISTENER_USER_ID);
      sessionString = loaded.sessionString;
      userId = loaded.userId;
      console.log(`[listener] session loaded for user ${userId} (decrypted in memory, not logged)`);
    } catch (err) {
      console.error("[listener] failed to load session from DB:", (err as Error).message);
      process.exit(1);
    }
  } else if (env.TELEGRAM_SESSION_STRING) {
    console.log("[listener] using spike session from env var (P0 mode)");
    sessionString = env.TELEGRAM_SESSION_STRING;
  } else {
    console.error(
      "[listener] fatal: provide either:\n" +
      "  - TELEGRAM_SESSION_STRING (P0 spike), or\n" +
      "  - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + ENCRYPTION_KEY (P1 DB sessions)"
    );
    process.exit(1);
  }

  if (!env.TELEGRAM_SPIKE_CHAT_ID) {
    console.error("[listener] fatal: TELEGRAM_SPIKE_CHAT_ID is required");
    process.exit(1);
  }

  const spikeChatId = BigInt(env.TELEGRAM_SPIKE_CHAT_ID);

  const client = createReadonlyClient(
    env.TELEGRAM_API_ID!,
    env.TELEGRAM_API_HASH!,
    sessionString
  );

  await startListening(client, spikeChatId, async (idempotencyKey, text, hasMedia) => {
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
      userId,
      brokerConnectionId: SPIKE_BROKER_CONNECTION_ID,
    };

    await queue.add("signal", jobData, {
      jobId: idempotencyKey,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    });

    console.log(`[listener] enqueued job id=${idempotencyKey} msg=${messageId} edit=${editVersion}`);
  });

  // Update last_connected_at when we successfully connect via DB session
  if (useDbSession) {
    await updateSessionStatus(userId, "active").catch(() => {/* non-fatal */});
  }

  console.log("[listener] running — waiting for messages. Press Ctrl+C to stop.");

  async function shutdown(): Promise<void> {
    console.log("\n[listener] shutting down");
    if (useDbSession) {
      await updateSessionStatus(userId, "disconnected").catch(() => {/* non-fatal */});
    }
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
