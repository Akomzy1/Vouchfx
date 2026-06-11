/**
 * Worker heartbeat — writes a row to worker_heartbeats every interval.
 * Uses the service-role client (workers run server-side with full DB access).
 * Returns a stop function that clears the interval.
 */

import { createLogger } from "../logger";

const log = createLogger("heartbeat");
const INTERVAL_MS = 30_000;

type WorkerType = "listener" | "executor";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

export function startHeartbeat(
  db: AnyDb,
  workerId: string,
  workerType: WorkerType,
  metadata: Record<string, unknown> = {}
): () => void {
  async function ping() {
    try {
      await db.from("worker_heartbeats").upsert(
        {
          worker_id:    workerId,
          worker_type:  workerType,
          last_seen_at: new Date().toISOString(),
          metadata,
        },
        { onConflict: "worker_id" }
      );
    } catch (err) {
      log.warn("heartbeat write failed", { error: (err as Error).message });
    }
  }

  void ping(); // immediate first ping
  const timer = setInterval(() => { void ping(); }, INTERVAL_MS);
  return () => clearInterval(timer);
}
