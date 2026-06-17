import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage, Raw } from "telegram/events";
import { DeletedMessage } from "telegram/events/DeletedMessage";
import { asReadonly, type ReadonlyTelegramClient } from "./readonly-guard";

// ─── idempotency key ─────────────────────────────────────────────────────────

/**
 * Build the canonical idempotency key for a Telegram message.
 *
 *   format:  "<chat_id>:<message_id>:<edit_version>"
 *   example: "-1001234567890:42:0"        (new message)
 *            "-1001234567890:42:1716800000" (edited; edit_version = editDate unix ts)
 *
 * This key is the BullMQ job id (P0.5) and the basis of the parsed_signals
 * unique constraint: (source_id, telegram_message_id).
 */
export function buildIdempotencyKey(
  chatId: bigint,
  messageId: number,
  editVersion: number
): string {
  return `${chatId.toString()}:${messageId}:${editVersion}`;
}

// ─── client factory ──────────────────────────────────────────────────────────

export function createReadonlyClient(
  apiId: number,
  apiHash: string,
  sessionString: string
): ReadonlyTelegramClient {
  const session = new StringSession(sessionString);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    // Suppress GramJS's verbose internal logger in production.
    // Set to "debug" locally if you need to trace MTProto frames.
    baseLogger: undefined,
  });
  return asReadonly(client);
}

// ─── liveness probe ──────────────────────────────────────────────────────────

/**
 * Probe whether the MTProto connection is actually alive.
 *
 * GramJS can enter a zombie state after a network blip: the process keeps
 * running and `connected` stays true, but the update loop times out forever
 * and no messages are delivered. updates.GetState is a READ-ONLY state query
 * (the same call GramJS's own update loop issues) — the cast back to
 * TelegramClient is the explicit, auditable exception the readonly guard
 * requires; no write operation is performed.
 */
export async function probeConnection(
  client: ReadonlyTelegramClient,
  timeoutMs = 15_000
): Promise<boolean> {
  const raw = client as unknown as TelegramClient;
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      raw.invoke(new Api.updates.GetState()),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("probe timeout")), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ─── subscription ────────────────────────────────────────────────────────────

/** 4 MB cap — Telegram photos compress to <500 KB typically; guards against large documents. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export type MessageCallback = (
  idempotencyKey: string,
  text: string,
  hasMedia: boolean,
  /** Base64 JPEG if the message is a photo and the download succeeded; undefined otherwise. */
  imageBase64: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawEvent: any
) => Promise<void>;

/**
 * Connect the client and subscribe to new messages on the given chat IDs.
 *
 * READ-ONLY contract: the ONLY operations called on `client` here are
 * connect() and addEventHandler(). No send/edit/delete/join/leave/react.
 *
 * If chatIds is empty the client connects but subscribes to nothing — it
 * stays warm for when P1.5 populates signal_sources and sync() reconnects it.
 */
export async function startListening(
  client: ReadonlyTelegramClient,
  chatIds: bigint[],
  onMessage: MessageCallback,
  // Bumped on ANY incoming update — the liveness signal for the watchdog. A
  // zombie update loop (TIMEOUT-spinning) delivers nothing, so this goes stale
  // even when a direct GetState probe still succeeds.
  onActivity?: () => void
): Promise<void> {
  await client.connect();

  // Catch-all raw update handler → activity heartbeat. Registered even with no
  // chats so a warm-but-idle client is still detectable. Raw fires on EVERY
  // server-pushed update, which stops entirely when the update loop zombies.
  if (onActivity) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client.addEventHandler((() => { onActivity(); }) as any, new Raw({}) as any);
  }

  if (chatIds.length === 0) {
    console.log("[listener] connected — no channels configured yet");
    return;
  }

  // GramJS EntityLike accepts string chat ids; toString() since native bigint
  // is not in EntityLike in this GramJS version.
  const chatIdStrings = chatIds.map(id => id.toString());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.addEventHandler(async (event: any) => {
    const message = event.message;
    if (!message) return;

    // GramJS chat ids are big-integer library objects, NOT native bigint —
    // normalize via toString. A zero/missing chat id must be skipped: it
    // breaks idempotency and BullMQ rejects job ids starting with "0:".
    const rawChatId = event.chatId ?? message.chatId;
    if (rawChatId == null) {
      console.warn(`[listener] msg ${message.id}: event has no chat id — skipped`);
      return;
    }
    const msgChatId = BigInt(rawChatId.toString());
    const msgId: number = message.id as number;
    // editDate is a Unix timestamp (seconds) set by Telegram when a message
    // is edited. 0 means never edited (new message).
    const editVersion: number = (message.editDate as number | undefined) ?? 0;

    const key = buildIdempotencyKey(msgChatId, msgId, editVersion);
    const text: string = (message.text as string | undefined) ?? "";
    const hasMedia: boolean = Boolean(message.media);

    // Download photo bytes for vision parsing. Only attempt for Telegram-compressed
    // photos (message.photo is truthy). Documents are skipped — they may be large
    // and rarely carry trading signals as images.
    let imageBase64: string | undefined;
    if (message.photo) {
      try {
        const buf = await client.downloadMedia(message, {});
        if (Buffer.isBuffer(buf) && buf.length <= MAX_IMAGE_BYTES) {
          imageBase64 = buf.toString("base64");
        } else if (Buffer.isBuffer(buf)) {
          console.warn(`[listener] msg ${msgId}: photo too large (${buf.length} bytes), skipping vision`);
        }
      } catch (err) {
        console.warn(`[listener] msg ${msgId}: photo download failed:`, (err as Error).message);
      }
    }

    await onMessage(key, text, hasMedia, imageBase64, event);
  }, new NewMessage({ chats: chatIdStrings }));

  console.log(`[listener] subscribed to ${chatIds.length} chat(s): ${chatIdStrings.slice(0, 5).join(", ")}`);
}

// ─── delete subscription ──────────────────────────────────────────────────────

export type DeleteCallback = (
  chatId: bigint,
  messageIds: number[]
) => Promise<void>;

/**
 * Subscribe to message-deleted events for the given chats.
 *
 * One handler is registered per chat so each closure captures its own chatId —
 * GramJS does not always surface the peer entity in delete events for regular
 * groups, so we avoid re-deriving it from the event.
 *
 * READ-ONLY contract: addEventHandler is the only operation called here.
 * No write operations.
 */
export function subscribeDeletes(
  client: ReadonlyTelegramClient,
  chatIds: bigint[],
  onDeleted: DeleteCallback
): void {
  if (chatIds.length === 0) return;

  for (const chatId of chatIds) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client.addEventHandler(async (event: any) => {
      const deletedIds: number[] = event.deletedIds ?? [];
      if (deletedIds.length > 0) {
        await onDeleted(chatId, deletedIds);
      }
    }, new DeletedMessage({ chats: [chatId.toString()] }));
  }

  console.log(`[listener] delete subscription on ${chatIds.length} chat(s)`);
}
