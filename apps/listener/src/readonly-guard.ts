import { TelegramClient } from "telegram";

/**
 * Safe surface area for a Telegram user session.
 *
 * INVARIANT — see .claude/skills/telegram-ingestion/SKILL.md:
 * A user session MUST perform ZERO write/outbound operations.
 *
 * PERMANENTLY FORBIDDEN on any user session:
 *   sendMessage · editMessage · deleteMessages · markAsRead
 *   joinChannel · leaveChannel · sendReaction · any outbound MTProto write
 *
 * This interface enforces the constraint at compile time: any function that
 * accepts ReadonlyTelegramClient cannot call a forbidden method without an
 * explicit, auditable cast back to TelegramClient.
 */
export interface ReadonlyTelegramClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addEventHandler(callback: (event: any) => Promise<void> | void, event: any): void;
  /**
   * Download media bytes from a message or MessageMedia object.
   * READ-ONLY — fetches from Telegram's CDN; performs no outbound write.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  downloadMedia(messageOrMedia: any, params?: object): Promise<Buffer | string | undefined>;
}

/**
 * Narrow a full TelegramClient to its read-only surface.
 * The cast is intentional: we give callers only the safe subset.
 */
export function asReadonly(client: TelegramClient): ReadonlyTelegramClient {
  return client as unknown as ReadonlyTelegramClient;
}
