import { type SupabaseClient } from "@supabase/supabase-js";
import { type AuditEventInsert, type AuditEventType, type Json } from "./types";

/**
 * Append one row to audit_events.
 * Called at each step of a signal's lifecycle so the user-facing audit log
 * (signal detail view) can reconstruct exactly what happened and why.
 *
 * Never include credentials, session strings, or raw broker passwords in payload.
 *
 * Note: db is typed as SupabaseClient<any> to avoid Supabase's complex generic
 * inference on utility helpers — the row argument is still fully typed via AuditEventInsert.
 */
export async function writeAuditEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  event: {
    userId: string;
    eventType: AuditEventType | string;
    parsedSignalId?: string;
    tradeId?: string;
    payload?: Json;
  }
): Promise<void> {
  const row: AuditEventInsert = {
    user_id: event.userId,
    event_type: event.eventType,
    parsed_signal_id: event.parsedSignalId ?? null,
    trade_id: event.tradeId ?? null,
    payload: event.payload ?? {},
  };

  const { error } = await db.from("audit_events").insert(row);
  if (error) {
    // Audit write failures must not silence the primary operation — log and
    // continue. A missing audit row is better than a crashed worker.
    console.error("[audit] write failed", { event, error });
  }
}
