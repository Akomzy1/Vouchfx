/**
 * BullMQ job payload for a Telegram signal.
 *
 * Job ID = idempotencyKey = "${chat_id}:${message_id}:${edit_version}".
 * BullMQ deduplicates in-flight jobs by ID; the DB ON CONFLICT guards cover
 * historical duplicates.
 *
 * All UUIDs reference rows already present (or seeded) in the DB — the worker
 * can resolve the user, broker, and source without a lookup chain.
 */
export interface SignalJobData {
  /** Canonical idempotency key — also the BullMQ job id. */
  idempotencyKey: string;
  /** Telegram chat id (bigint serialised as string). */
  chatId: string;
  messageId: number;
  editVersion: number;
  text: string;
  hasMedia: boolean;
  /** UUID — signal_sources.id */
  sourceId: string;
  /** UUID — users.id */
  userId: string;
  /** UUID — broker_connections.id */
  brokerConnectionId: string;
}
