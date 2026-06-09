/**
 * BullMQ job payload for the "vouchfx:signals" queue.
 *
 * Job ID = idempotencyKey = "${chat_id}:${message_id}:${edit_version}".
 * Cancel jobs use "${chat_id}:${message_id}:cancel" so they don't collide
 * with the original signal or any edit version.
 *
 * BullMQ deduplicates in-flight jobs by ID; the DB ON CONFLICT guard covers
 * historical duplicates for signal jobs.
 *
 * All UUIDs reference rows already present (or seeded) in the DB — the worker
 * can resolve the user, broker, and source without a lookup chain.
 */
export interface SignalJobData {
  /**
   * Discriminator:
   *   "signal" — new message or edit; routed through the Claude parser.
   *   "cancel" — message deleted; pre-classified, bypasses the parser.
   */
  jobType: "signal" | "cancel";
  /** Canonical idempotency key — also the BullMQ job id. */
  idempotencyKey: string;
  /** Telegram chat id (bigint serialised as string). */
  chatId: string;
  messageId: number;
  /** Unix timestamp of edit (0 for original message). 0 for cancel jobs. */
  editVersion: number;
  /** Raw message text. Empty string for cancel jobs. */
  text: string;
  hasMedia: boolean;
  /**
   * Base64-encoded JPEG from the Telegram photo, for vision parsing.
   * Only present when the message contained a photo and the download succeeded.
   * Absent for cancel jobs, text-only messages, and failed downloads.
   */
  imageBase64?: string;
  /** UUID — signal_sources.id */
  sourceId: string;
  /** UUID — users.id */
  userId: string;
  /** UUID — broker_connections.id */
  brokerConnectionId: string;
  /**
   * Cancel jobs only: UUID of the parsed_signals row whose PENDING trade(s)
   * should be cancelled. Null means the deletion was looked up but no signal
   * row was found (message was never parsed as a signal — safe to ignore).
   */
  cancelTargetSignalId?: string;
}
