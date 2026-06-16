/**
 * Ops alerting for the listener — used when a Telegram message is received but
 * cannot be enqueued (e.g. Redis down / quota exceeded). Delivery is by email
 * (Resend) and an in-app notification, both INDEPENDENT of Redis, so the alert
 * still fires precisely when the queue is the thing that's broken.
 *
 * De-duplicated to at most one alert per 10 minutes so a sustained outage
 * doesn't spam the admin inbox.
 */
import type { parseEnv } from "@vouchfx/config";

type Env = ReturnType<typeof parseEnv>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = { from(t: string): any };

let lastAlertAt = 0;
const ALERT_INTERVAL_MS = 10 * 60_000;

export async function alertEnqueueFailure(
  db: AnyDb,
  env: Env,
  details: { idempotencyKey: string; error: string }
): Promise<void> {
  // Always log the real cause clearly (not BullMQ's 12KB Lua dump).
  console.error(
    `[pool] ENQUEUE FAILED for ${details.idempotencyKey} — signal dropped. Cause: ${details.error}`
  );

  const now = Date.now();
  if (now - lastAlertAt < ALERT_INTERVAL_MS) return;
  lastAlertAt = now;

  const adminEmails = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  const subject = "VouchFX ALERT: signal could not be queued";
  const body =
    `A Telegram signal was received but could NOT be enqueued, so it was dropped.\n\n` +
    `Idempotency key: ${details.idempotencyKey}\n` +
    `Cause: ${details.error}\n\n` +
    `This usually means the Redis queue is down or over its request limit. ` +
    `Signals will keep being lost until it is restored.`;

  // Email via Resend (best-effort, non-fatal).
  if (env.RESEND_API_KEY && adminEmails.length > 0) {
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "VouchFX Alerts <alerts@vouchfx.com>",
        to: adminEmails,
        subject,
        text: body,
      }),
    }).catch(() => undefined);
  }

  // In-app notification to admin users (best-effort).
  try {
    if (adminEmails.length > 0) {
      const { data: admins } = await db
        .from("users")
        .select("id")
        .in("email", adminEmails);
      for (const a of (admins ?? []) as { id: string }[]) {
        await db.from("notifications").insert({
          user_id: a.id,
          event_type: "ops_enqueue_failed",
          title: subject,
          body,
        });
      }
    }
  } catch {
    /* non-fatal */
  }
}
