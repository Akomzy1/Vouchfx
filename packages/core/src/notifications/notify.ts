import type { NotifyEventType } from "./types";

// Duck-typed Supabase client — avoids importing @supabase/supabase-js into core
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = { from(table: string): any };

/**
 * Web Push channel, injected by the caller. Defined as a plain function type so
 * notify() (which is in the client-safe core barrel) never imports the Node-only
 * push crypto. Build it with createPushSender() from "@vouchfx/core/push".
 */
export type PushSender = (
  userId: string,
  payload: { title: string; body?: string; event: NotifyEventType; url?: string }
) => Promise<void>;

export interface NotifyParams {
  userId: string;
  toEmail?: string | null;
  event: NotifyEventType;
  title: string;
  body?: string;
  resendApiKey?: string | null;
  fromEmail?: string;
  /** Optional push channel. When absent, push is skipped (in-app + email only). */
  pushSender?: PushSender | null;
}

export async function notify(db: AnyDb, params: NotifyParams): Promise<void> {
  const {
    userId, toEmail, event, title, body,
    resendApiKey, pushSender,
    fromEmail = "VouchFX Alerts <alerts@mail.vouchfx.com>",
  } = params;

  // 1. Check preferences — missing row means all channels on
  const { data: pref } = await db
    .from("notification_preferences")
    .select("email_enabled, in_app_enabled, push_enabled")
    .eq("user_id", userId)
    .eq("event_type", event)
    .maybeSingle();

  const inAppEnabled: boolean = pref?.in_app_enabled ?? true;
  const emailEnabled: boolean = pref?.email_enabled  ?? true;
  const pushEnabled:  boolean = pref?.push_enabled   ?? true;

  // 2. In-app notification (insert into notifications table)
  if (inAppEnabled) {
    await db
      .from("notifications")
      .insert({ user_id: userId, event_type: event, title, body: body ?? null });
  }

  // 3. Web Push — third channel; same per-event toggle. Non-fatal.
  if (pushEnabled && pushSender) {
    pushSender(userId, { title, body, event }).catch(() => undefined);
  }

  // 4. Email via Resend — fire-and-forget, non-fatal
  if (emailEnabled && resendApiKey && toEmail) {
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: title,
        html: buildEmailHtml(title, body),
      }),
    }).catch(() => undefined); // non-fatal
  }
}

function buildEmailHtml(title: string, body?: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e0e6ef;padding:32px;max-width:480px;margin:0 auto">
  <div style="background:#1a1d2e;border:1px solid #2a2d3e;border-radius:12px;padding:24px">
    <p style="font-size:12px;color:#8b98a5;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.08em">VouchFX</p>
    <h2 style="font-size:18px;font-weight:600;margin:0 0 12px;color:#e0e6ef">${escHtml(title)}</h2>
    ${body ? `<p style="font-size:14px;color:#a0aab4;margin:0">${escHtml(body)}</p>` : ""}
  </div>
  <p style="font-size:11px;color:#4a5568;margin:16px 0 0;text-align:center">
    You can turn off these alerts in VouchFX Settings → Notifications.
  </p>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
