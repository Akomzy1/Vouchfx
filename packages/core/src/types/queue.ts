/**
 * BullMQ job payload for the "vouchfx-signals" queue.
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

/**
 * Per-account BullMQ job id for a signal (multi-account fan-out, VCH-BRK-04).
 *
 * A signal copies to every copy-enabled account, so the base idempotency key
 * `${chat}:${msg}:${edit}` is combined with the broker connection id. This keeps
 * each account's job DISTINCT (BullMQ won't dedupe them into one execution)
 * while staying idempotent PER account (same signal + same account → same id).
 * The executor scopes every trade query by broker_connection_id to match.
 *
 * IMPORTANT: BullMQ custom job ids cannot contain ":" (its Redis key separator),
 * so the composite is joined with "_" — otherwise the enqueue is rejected and
 * the signal is dropped. Still fully deterministic per (signal, account).
 */
export function accountSignalJobId(baseKey: string, brokerConnectionId: string): string {
  return `${baseKey}:${brokerConnectionId}`.replace(/:/g, "_");
}

/** Per-account cancel job id for a deleted message (one cancel per account). Colon-free. */
export function accountCancelJobId(
  chatId: string,
  messageId: number,
  brokerConnectionId: string
): string {
  return `${chatId}:${messageId}:cancel:${brokerConnectionId}`.replace(/:/g, "_");
}
