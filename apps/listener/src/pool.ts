/**
 * UserPool — supervised pool of one GramJS read-only client per connected user.
 *
 * Lifecycle:
 *   pool.start()    → initial load of all active sessions from DB
 *   pool.sync()     → diff DB state vs pool; add/remove/reconnect as needed
 *   pool.shutdown() → graceful disconnect of all clients
 *
 * READ-ONLY contract: every client is wrapped via ReadonlyTelegramClient.
 * Zero write/outbound operations are performed on any user session.
 *
 * Polling approach (vs Supabase Realtime): simpler at beta scale (≤50 users).
 * Upgrade to Realtime in Phase 3 if latency of the 30s sync window matters.
 */
import { createClient } from "@supabase/supabase-js";
import type { Queue } from "bullmq";
import { decryptSession, type SignalJobData } from "@vouchfx/core";
import { parseEnv } from "@vouchfx/config";
import { createReadonlyClient, startListening } from "./listener";
import { updateSessionStatus } from "./session-manager";

const SPIKE_SOURCE_ID = "00000000-0000-0000-0000-000000000002";
const SPIKE_BROKER_ID = "00000000-0000-0000-0000-000000000001";

// ─── Internal types ──────────────────────────────────────────────────────────

interface PoolEntry {
  userId: string;
  /** Set of chatId strings for change detection on sync. */
  chatIds: Set<string>;
  /** chatId.toString() → signal_sources.id, looked up once at connect time. */
  sourceMap: Map<string, string>;
  brokerConnectionId: string;
  disconnect: () => Promise<void>;
}

interface SessionRow {
  userId: string;
  sessionEncrypted: string;
  apiId: number;
}

// ─── UserPool ────────────────────────────────────────────────────────────────

export class UserPool {
  private entries = new Map<string, PoolEntry>();
  private env: ReturnType<typeof parseEnv>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: ReturnType<typeof createClient>;
  private queue: Queue<SignalJobData, void, string>;

  constructor(queue: Queue<SignalJobData, void, string>) {
    this.env = parseEnv();
    if (!this.env.SUPABASE_URL || !this.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    }
    this.db = createClient(this.env.SUPABASE_URL, this.env.SUPABASE_SERVICE_ROLE_KEY);
    this.queue = queue;
  }

  /** Initial load: connect a client for every active session in the DB. */
  async start(): Promise<void> {
    const sessions = await this.fetchSessions();
    if (sessions.length === 0) {
      console.log("[pool] no active sessions — waiting for users to connect Telegram");
      return;
    }
    const [sourceMap, brokerMap] = await this.fetchUserData(sessions.map(s => s.userId));
    for (const s of sessions) {
      await this.addEntry(s, sourceMap.get(s.userId) ?? new Map(), brokerMap.get(s.userId) ?? SPIKE_BROKER_ID);
    }
    console.log(`[pool] started — ${this.entries.size} user(s) active`);
  }

  /**
   * Diff DB state vs pool:
   *   - Active in DB but not in pool → add
   *   - In pool but gone/inactive in DB → remove
   *   - In both but chat IDs changed → reconnect
   */
  async sync(): Promise<void> {
    const sessions = await this.fetchSessions();
    const dbUserIds = new Set(sessions.map(s => s.userId));

    for (const userId of this.entries.keys()) {
      if (!dbUserIds.has(userId)) {
        await this.removeEntry(userId);
      }
    }

    if (sessions.length === 0) return;

    const [sourceMap, brokerMap] = await this.fetchUserData(sessions.map(s => s.userId));

    for (const s of sessions) {
      const existing = this.entries.get(s.userId);
      const newChatIds = sourceMap.get(s.userId) ?? new Map<string, string>();

      if (!existing) {
        await this.addEntry(s, newChatIds, brokerMap.get(s.userId) ?? SPIKE_BROKER_ID);
      } else {
        const changed =
          newChatIds.size !== existing.chatIds.size ||
          [...newChatIds.keys()].some(id => !existing.chatIds.has(id));
        if (changed) {
          console.log(`[pool] user ${s.userId} sources changed — reconnecting`);
          await this.removeEntry(s.userId);
          await this.addEntry(s, newChatIds, brokerMap.get(s.userId) ?? SPIKE_BROKER_ID);
        }
      }
    }
  }

  /** Disconnect all clients gracefully. */
  async shutdown(): Promise<void> {
    console.log(`[pool] shutting down ${this.entries.size} client(s)`);
    await Promise.allSettled([...this.entries.keys()].map(id => this.removeEntry(id)));
  }

  get size(): number {
    return this.entries.size;
  }

  // ── DB queries ─────────────────────────────────────────────────────────────

  private async fetchSessions(): Promise<SessionRow[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.db as any)
      .from("telegram_sessions")
      .select("user_id, session_string_encrypted, api_id")
      .eq("status", "active");

    if (error) {
      console.error("[pool] fetchSessions error:", error.message);
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((row: any) => ({
      userId: row.user_id as string,
      sessionEncrypted: row.session_string_encrypted as string,
      apiId: row.api_id as number,
    }));
  }

  /**
   * Batch-fetch signal sources and active broker connections for a list of users.
   *
   * Returns:
   *   sourceMap: userId → Map<chatId.toString(), sourceUUID>
   *   brokerMap: userId → first active brokerConnectionId
   */
  private async fetchUserData(
    userIds: string[]
  ): Promise<[Map<string, Map<string, string>>, Map<string, string>]> {
    const sourceMap = new Map<string, Map<string, string>>();
    const brokerMap = new Map<string, string>();

    if (userIds.length === 0) return [sourceMap, brokerMap];

    const [sourcesRes, brokersRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.db as any)
        .from("signal_sources")
        .select("user_id, id, telegram_chat_id")
        .in("user_id", userIds)
        .eq("is_enabled", true),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.db as any)
        .from("broker_connections")
        .select("user_id, id")
        .in("user_id", userIds)
        .eq("is_active", true),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (sourcesRes.data ?? []) as any[]) {
      const uid = row.user_id as string;
      if (!sourceMap.has(uid)) sourceMap.set(uid, new Map());
      sourceMap.get(uid)!.set(String(row.telegram_chat_id), row.id as string);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (brokersRes.data ?? []) as any[]) {
      if (!brokerMap.has(row.user_id as string)) {
        brokerMap.set(row.user_id as string, row.id as string);
      }
    }

    return [sourceMap, brokerMap];
  }

  // ── Pool mutations ─────────────────────────────────────────────────────────

  private async addEntry(
    session: SessionRow,
    chatSourceMap: Map<string, string>, // chatId.toString() → sourceId
    brokerConnectionId: string
  ): Promise<void> {
    const { userId, sessionEncrypted, apiId } = session;

    if (!this.env.ENCRYPTION_KEY || !this.env.TELEGRAM_API_HASH) {
      console.error(`[pool] missing ENCRYPTION_KEY or TELEGRAM_API_HASH — skipping user ${userId}`);
      return;
    }

    let sessionString: string;
    try {
      sessionString = decryptSession(sessionEncrypted, this.env.ENCRYPTION_KEY);
    } catch (err) {
      console.error(`[pool] decrypt failed for user ${userId}:`, (err as Error).message);
      return;
    }

    // Dev fallback: if user has no signal sources yet (P1.5 not done),
    // subscribe to TELEGRAM_SPIKE_CHAT_ID if set, so the listener is testable.
    let effectiveChatSourceMap = chatSourceMap;
    if (effectiveChatSourceMap.size === 0 && this.env.TELEGRAM_SPIKE_CHAT_ID) {
      effectiveChatSourceMap = new Map([[this.env.TELEGRAM_SPIKE_CHAT_ID, SPIKE_SOURCE_ID]]);
    }

    const chatIds = [...effectiveChatSourceMap.keys()].map(id => BigInt(id));
    const client = createReadonlyClient(apiId, this.env.TELEGRAM_API_HASH, sessionString);

    await startListening(client, chatIds, async (idempotencyKey, text, hasMedia) => {
      const parts = idempotencyKey.split(":");
      const chatId = parts[0]!;
      const messageId = parseInt(parts[1]!, 10);
      const editVersion = parseInt(parts[2]!, 10);

      const sourceId = effectiveChatSourceMap.get(chatId) ?? SPIKE_SOURCE_ID;

      const jobData: SignalJobData = {
        idempotencyKey,
        chatId,
        messageId,
        editVersion,
        text,
        hasMedia,
        sourceId,
        userId,
        brokerConnectionId,
      };

      await this.queue.add("signal", jobData, {
        jobId: idempotencyKey,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      });

      console.log(`[pool] user=${userId} enqueued job=${idempotencyKey}`);
    });

    this.entries.set(userId, {
      userId,
      chatIds: new Set(effectiveChatSourceMap.keys()),
      sourceMap: effectiveChatSourceMap,
      brokerConnectionId,
      disconnect: () => client.disconnect(),
    });

    await updateSessionStatus(userId, "active").catch(() => {});
    console.log(`[pool] user ${userId} connected — ${chatIds.length} channel(s)`);
  }

  private async removeEntry(userId: string): Promise<void> {
    const entry = this.entries.get(userId);
    if (!entry) return;
    this.entries.delete(userId);
    try {
      await entry.disconnect();
    } catch (err) {
      console.error(`[pool] disconnect error for user ${userId}:`, (err as Error).message);
    }
    await updateSessionStatus(userId, "disconnected").catch(() => {});
    console.log(`[pool] removed user ${userId}`);
  }
}
