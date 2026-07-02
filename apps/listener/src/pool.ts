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
import { decryptSession, accountSignalJobId, accountCancelJobId, type SignalJobData } from "@vouchfx/core";
import { parseEnv } from "@vouchfx/config";
import { createReadonlyClient, probeConnection, startListening, subscribeDeletes } from "./listener";
import type { ReadonlyTelegramClient } from "./readonly-guard";
import { updateSessionStatus } from "./session-manager";
import { alertEnqueueFailure } from "./ops-alert";

const SPIKE_SOURCE_ID = "00000000-0000-0000-0000-000000000002";
const SPIKE_BROKER_ID = "00000000-0000-0000-0000-000000000001";

/** Order-insensitive equality for two id lists (fan-out change detection). */
function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

// ─── Internal types ──────────────────────────────────────────────────────────

interface PoolEntry {
  userId: string;
  /** Set of chatId strings for change detection on sync. */
  chatIds: Set<string>;
  /** chatId.toString() → signal_sources.id, looked up once at connect time. */
  sourceMap: Map<string, string>;
  /** Copy-enabled active accounts a signal fans out to (VCH-BRK-04). */
  brokerConnectionIds: string[];
  disconnect: () => Promise<void>;
  /** For the watchdog: probe target + what's needed to rebuild the client. */
  client: ReadonlyTelegramClient;
  session: SessionRow;
  probeFailures: number;
  /** Last time ANY update arrived — staleness signals a dead update loop. */
  activity: { at: number };
  /** When this client was (re)built — used for the proactive age-based reconnect. */
  connectedAt: number;
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
      await this.addEntry(s, sourceMap.get(s.userId) ?? new Map(), brokerMap.get(s.userId) ?? [SPIKE_BROKER_ID]);
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

      const newBrokerIds = brokerMap.get(s.userId) ?? [SPIKE_BROKER_ID];

      if (!existing) {
        await this.addEntry(s, newChatIds, newBrokerIds);
      } else {
        const sourcesChanged =
          newChatIds.size !== existing.chatIds.size ||
          [...newChatIds.keys()].some(id => !existing.chatIds.has(id));
        if (sourcesChanged) {
          // Subscribed channels changed → rebuild the Telegram client.
          console.log(`[pool] user ${s.userId} sources changed — reconnecting`);
          await this.removeEntry(s.userId);
          await this.addEntry(s, newChatIds, newBrokerIds);
        } else if (!sameIds(existing.brokerConnectionIds, newBrokerIds)) {
          // Only the copy-enabled account set changed → update the fan-out list
          // in place (the enqueue closures read it live); no reconnect needed.
          console.log(`[pool] user ${s.userId} copy accounts changed → ${newBrokerIds.length} account(s)`);
          existing.brokerConnectionIds = newBrokerIds;
        }
      }
    }
  }

  /**
   * Liveness watchdog. GramJS connections can zombie after a network blip: the
   * process stays up but the update loop spins on TIMEOUT forever and delivers
   * nothing, while a direct GetState probe STILL succeeds (different code path).
   * So we rebuild on EITHER signal:
   *   1. probe (GetState) fails twice consecutively, OR
   *   2. no update has arrived for STALE_ACTIVITY_MS — the reliable zombie tell
   *      (the catch-all activity handler stops firing when the loop is dead).
   */
  async watchdog(): Promise<void> {
    const STALE_ACTIVITY_MS = 12 * 60_000;
    const MAX_CONN_AGE_MS = 25 * 60_000; // proactive reconnect backstop
    for (const entry of [...this.entries.values()]) {
      const stale = Date.now() - entry.activity.at;
      const age = Date.now() - entry.connectedAt;
      const probeAlive = await probeConnection(entry.client);

      if (probeAlive) {
        entry.probeFailures = 0;
      } else {
        entry.probeFailures += 1;
        console.warn(`[pool] user ${entry.userId} liveness probe failed (${entry.probeFailures} consecutive)`);
      }

      const probeDead = entry.probeFailures >= 2;
      const activityDead = stale > STALE_ACTIVITY_MS;
      // Backstop: rebuild any connection older than MAX_CONN_AGE regardless of
      // apparent health — guarantees no zombie survives more than ~25 min even
      // if both probe and activity heuristics are fooled. GramJS catches up on
      // reconnect so a brief rebuild doesn't lose messages.
      const aged = age > MAX_CONN_AGE_MS;
      if (!probeDead && !activityDead && !aged) continue;

      console.warn(
        `[pool] user ${entry.userId} rebuilding (probeDead=${probeDead}, idle=${Math.round(stale / 60_000)}m, age=${Math.round(age / 60_000)}m)`
      );
      const { session, sourceMap, brokerConnectionIds } = entry;
      await this.removeEntry(entry.userId);
      try {
        await this.addEntry(session, sourceMap, brokerConnectionIds);
        console.log(`[pool] user ${entry.userId} client rebuilt after dead connection`);
      } catch (err) {
        // Next watchdog/sync tick retries; sessions stay in DB.
        console.error(`[pool] rebuild failed for user ${entry.userId}:`, (err as Error).message);
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
    // 'disconnected' is the pool's own worker-lifecycle marker (set on
    // shutdown/rebuild) — those sessions MUST be reloaded, otherwise a
    // restart orphans every user. Only 'banned'/'limited' are excluded.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.db as any)
      .from("telegram_sessions")
      .select("user_id, session_string_encrypted, api_id")
      .in("status", ["active", "disconnected"]);

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
   *   brokerMap: userId → copy-enabled active brokerConnectionIds (fan-out list).
   *              A user with active accounts but NONE copy-enabled maps to []
   *              (→ no jobs); a user with no active accounts is absent (→ the
   *              caller's spike fallback applies).
   */
  private async fetchUserData(
    userIds: string[]
  ): Promise<[Map<string, Map<string, string>>, Map<string, string[]>]> {
    const sourceMap = new Map<string, Map<string, string>>();
    const brokerMap = new Map<string, string[]>();

    if (userIds.length === 0) return [sourceMap, brokerMap];

    const [sourcesRes, brokersRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.db as any)
        .from("signal_sources")
        .select("user_id, id, telegram_chat_id")
        .in("user_id", userIds)
        .eq("is_enabled", true),
      // Every ACTIVE account with its copy_enabled flag. Ordered primary-first
      // then oldest so the fan-out list is deterministic.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.db as any)
        .from("broker_connections")
        .select("user_id, id, is_primary, created_at, copy_enabled")
        .in("user_id", userIds)
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (sourcesRes.data ?? []) as any[]) {
      const uid = row.user_id as string;
      if (!sourceMap.has(uid)) sourceMap.set(uid, new Map());
      sourceMap.get(uid)!.set(String(row.telegram_chat_id), row.id as string);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (brokersRes.data ?? []) as any[]) {
      const uid = row.user_id as string;
      // Presence in the map marks "has an active account"; the array holds only
      // the copy-enabled ones a signal fans out to.
      if (!brokerMap.has(uid)) brokerMap.set(uid, []);
      if (row.copy_enabled) brokerMap.get(uid)!.push(row.id as string);
    }

    return [sourceMap, brokerMap];
  }

  // ── Pool mutations ─────────────────────────────────────────────────────────

  private async addEntry(
    session: SessionRow,
    chatSourceMap: Map<string, string>, // chatId.toString() → sourceId
    brokerConnectionIds: string[]       // copy-enabled accounts to fan out to
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
    const activity = { at: Date.now() };

    await startListening(client, chatIds, async (idempotencyKey, text, hasMedia, imageBase64) => {
      const parts = idempotencyKey.split(":");
      const chatId = parts[0]!;
      const messageId = parseInt(parts[1]!, 10);
      const editVersion = parseInt(parts[2]!, 10);

      const sourceId = effectiveChatSourceMap.get(chatId) ?? SPIKE_SOURCE_ID;

      // Fan out to every copy-enabled account. Read the LIVE list off the entry
      // so a sync() copy-toggle takes effect without reconnecting the client.
      // Each job gets its OWN idempotency key (base key + broker id) so BullMQ
      // doesn't dedupe the accounts into a single execution; the executor scopes
      // all trade matching by that account.
      const fanoutIds = this.entries.get(userId)?.brokerConnectionIds ?? brokerConnectionIds;
      for (const brokerConnectionId of fanoutIds) {
        const accountKey = accountSignalJobId(idempotencyKey, brokerConnectionId);
        const jobData: SignalJobData = {
          jobType: "signal",
          idempotencyKey: accountKey,
          chatId,
          messageId,
          editVersion,
          text,
          hasMedia,
          imageBase64,
          sourceId,
          userId,
          brokerConnectionId,
        };

        try {
          await this.queue.add("signal", jobData, {
            jobId: accountKey,
            attempts: 3,
            backoff: { type: "exponential", delay: 2000 },
          });
          console.log(`[pool] user=${userId} enqueued job=${accountKey}`);
        } catch (err) {
          // A received signal that can't be queued is a dropped signal — alert ops.
          await alertEnqueueFailure(this.db, this.env, {
            idempotencyKey: accountKey,
            error: (err as Error).message,
          });
        }
      }
    }, () => { activity.at = Date.now(); });

    // Subscribe to delete events — channels/supergroups only; chats filter
    // is unreliable for regular groups (GramJS limitation, see DeletedMessage docs).
    subscribeDeletes(client, chatIds, async (chatId, messageIds) => {
      const chatIdStr = chatId.toString();
      const sourceId = effectiveChatSourceMap.get(chatIdStr) ?? SPIKE_SOURCE_ID;
      const fanoutIds = this.entries.get(userId)?.brokerConnectionIds ?? brokerConnectionIds;
      for (const msgId of messageIds) {
        // A deletion cancels the pending order on EACH copy-enabled account.
        for (const brokerConnectionId of fanoutIds) {
          await this.handleDeletedMessage(userId, chatIdStr, msgId, sourceId, brokerConnectionId);
        }
      }
    });

    this.entries.set(userId, {
      userId,
      chatIds: new Set(effectiveChatSourceMap.keys()),
      sourceMap: effectiveChatSourceMap,
      brokerConnectionIds,
      disconnect: () => client.disconnect(),
      client,
      session,
      probeFailures: 0,
      activity,
      connectedAt: Date.now(),
    });

    await updateSessionStatus(userId, "active").catch(() => {});
    console.log(`[pool] user ${userId} connected — ${chatIds.length} channel(s)`);
  }

  /**
   * Called when a Telegram message is deleted.
   * If a PENDING trade exists for that signal, emits a cancel job.
   * Open (filled) positions are left untouched — the user decides.
   */
  private async handleDeletedMessage(
    userId: string,
    chatId: string,
    messageId: number,
    sourceId: string,
    brokerConnectionId: string
  ): Promise<void> {
    // Look up the parsed_signal for this (source, message) pair
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ps } = await (this.db as any)
      .from("parsed_signals")
      .select("id")
      .eq("source_id", sourceId)
      .eq("telegram_message_id", messageId)
      .maybeSingle();

    if (!ps) {
      // Message was never parsed as a signal — nothing to cancel
      return;
    }

    const parsedSignalId = (ps as { id: string }).id;

    // Only cancel if THIS account has a PENDING (unfilled) order — not OPEN
    // positions, and not another account's trade.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pending } = await (this.db as any)
      .from("trades")
      .select("id")
      .eq("parsed_signal_id", parsedSignalId)
      .eq("broker_connection_id", brokerConnectionId)
      .eq("status", "PENDING");

    if (!pending || (pending as unknown[]).length === 0) {
      console.log(`[pool] delete msg=${messageId} — no PENDING trades on this account, skipping cancel`);
      return;
    }

    // Per-account cancel key so each account's cancel is a distinct job.
    const idempotencyKey = accountCancelJobId(chatId, messageId, brokerConnectionId);
    const jobData: SignalJobData = {
      jobType: "cancel",
      idempotencyKey,
      chatId,
      messageId,
      editVersion: 0,
      text: "",
      hasMedia: false,
      sourceId,
      userId,
      brokerConnectionId,
      cancelTargetSignalId: parsedSignalId,
    };

    try {
      await this.queue.add("signal", jobData, {
        jobId: idempotencyKey,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      });
      console.log(`[pool] delete msg=${messageId} → cancel job enqueued (signal=${parsedSignalId.slice(0, 8)})`);
    } catch (err) {
      await alertEnqueueFailure(this.db, this.env, {
        idempotencyKey,
        error: (err as Error).message,
      });
    }
  }

  private async removeEntry(userId: string): Promise<void> {
    const entry = this.entries.get(userId);
    if (!entry) return;
    this.entries.delete(userId);
    try {
      // Race against a timeout — disconnect() can hang on a dead connection.
      await Promise.race([
        entry.disconnect(),
        new Promise((resolve) => setTimeout(resolve, 10_000)),
      ]);
    } catch (err) {
      console.error(`[pool] disconnect error for user ${userId}:`, (err as Error).message);
    }
    await updateSessionStatus(userId, "disconnected").catch(() => {});
    console.log(`[pool] removed user ${userId}`);
  }
}
