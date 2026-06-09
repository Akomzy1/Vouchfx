import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage } from "telegram/events";
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

// ─── subscription ────────────────────────────────────────────────────────────

export type MessageCallback = (
  idempotencyKey: string,
  text: string,
  hasMedia: boolean,
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
  onMessage: MessageCallback
): Promise<void> {
  await client.connect();

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

    const msgChatId: bigint =
      typeof event.chatId === "bigint" ? event.chatId : BigInt(0);
    const msgId: number = message.id as number;
    // editDate is a Unix timestamp (seconds) set by Telegram when a message
    // is edited. 0 means never edited (new message).
    const editVersion: number = (message.editDate as number | undefined) ?? 0;

    const key = buildIdempotencyKey(msgChatId, msgId, editVersion);
    const text: string = (message.text as string | undefined) ?? "";
    const hasMedia: boolean = Boolean(message.media);

    await onMessage(key, text, hasMedia, event);
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
