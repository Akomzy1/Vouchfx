/**
 * @vouchfx/core/push — Node-only Web Push helpers. NOT in the core barrel.
 *
 * createPushSender() returns the function injected into notify() as the third
 * delivery channel. It loads a user's device subscriptions, sends the encrypted
 * push to each, and prunes any endpoint the push service reports as gone.
 */
import { sendWebPush, type VapidConfig } from "./web-push";
import type { PushSender } from "../notifications/notify";

export { sendWebPush, generateVapidKeys } from "./web-push";
export type { VapidConfig, PushSubscriptionKeys, PushResult } from "./web-push";

// Duck-typed Supabase client — keeps @supabase/supabase-js out of core.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = { from(table: string): any };

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Build the push channel for notify(). Returns null when VAPID is not
 * configured, so notify() simply skips push.
 */
export function createPushSender(
  db: AnyDb,
  vapid: Partial<VapidConfig> | null | undefined
): PushSender | null {
  if (!vapid?.publicKey || !vapid.privateKey || !vapid.subject) return null;
  const cfg: VapidConfig = {
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey,
    subject: vapid.subject,
  };

  return async (userId, payload) => {
    const { data: subs } = await db
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);

    await Promise.all(
      ((subs ?? []) as SubRow[]).map(async (s) => {
        try {
          const result = await sendWebPush(
            { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
            payload,
            cfg
          );
          if (result.gone) {
            await db.from("push_subscriptions").delete().eq("id", s.id);
          } else if (result.ok) {
            await db
              .from("push_subscriptions")
              .update({ last_used_at: new Date().toISOString() })
              .eq("id", s.id);
          }
        } catch {
          // Per-device failure must not affect other devices or the caller.
        }
      })
    );
  };
}
