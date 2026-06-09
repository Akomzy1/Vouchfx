import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage } from "telegram/events";
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
 * Connect the client and subscribe to new messages on `chatId`.
 *
 * READ-ONLY contract: the ONLY operations called on `client` here are
 * connect() and addEventHandler(). No send/edit/delete/join/leave/react.
 */
export async function startListening(
  client: ReadonlyTelegramClient,
  chatId: bigint,
  onMessage: MessageCallback
): Promise<void> {
  await client.connect();
  console.log("[listener] connected to Telegram");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.addEventHandler(async (event: any) => {
    const message = event.message;
    if (!message) return;

    const msgChatId: bigint =
      typeof event.chatId === "bigint" ? event.chatId : chatId;
    const msgId: number = message.id as number;
    // editDate is a Unix timestamp (seconds) set by Telegram when a message
    // is edited. 0 means never edited (new message).
    const editVersion: number = (message.editDate as number | undefined) ?? 0;

    const key = buildIdempotencyKey(msgChatId, msgId, editVersion);
    const text: string = (message.text as string | undefined) ?? "";
    const hasMedia: boolean = Boolean(message.media);

    await onMessage(key, text, hasMedia, event);
  // GramJS EntityLike accepts string chat ids; use toString() since native bigint
  // is not in EntityLike in this GramJS version.
  }, new NewMessage({ chats: [chatId.toString()] }));

  console.log(`[listener] subscribed to chat ${chatId.toString()}`);
}
