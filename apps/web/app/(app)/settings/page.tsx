import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth/actions";
import { Lock, LogOut } from "lucide-react";
import type { Metadata } from "next";
import BrokerConnections, {
  type BrokerConnectionRow,
} from "@/components/broker/BrokerConnections";
import NotificationPreferences from "@/components/notifications/NotificationPreferences";
import PushManager from "@/components/notifications/PushManager";
import ProfileName from "@/components/settings/ProfileName";
import DeleteAccount from "@/components/settings/DeleteAccount";
import { NOTIFY_EVENTS } from "@vouchfx/core";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [{ data: profileRow }, { data: brokerConnections }, { data: notifPrefs }] = await Promise.all([
    db.from("users").select("full_name").eq("id", user.id).single(),
    db
      .from("broker_connections")
      .select("id, label, platform, is_active, status, account_mode, server_hint, last_status_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    db
      .from("notification_preferences")
      .select("event_type, email_enabled, in_app_enabled, push_enabled")
      .eq("user_id", user.id),
  ]);

  // Build full preferences list (defaults for missing rows)
  const rowMap = new Map(
    ((notifPrefs ?? []) as { event_type: string; email_enabled: boolean; in_app_enabled: boolean; push_enabled: boolean }[])
      .map((r) => [r.event_type, r])
  );
  const initialPrefs = NOTIFY_EVENTS.map((event) => ({
    event_type:    event as typeof NOTIFY_EVENTS[number],
    email_enabled:  rowMap.get(event)?.email_enabled  ?? true,
    in_app_enabled: rowMap.get(event)?.in_app_enabled ?? true,
    push_enabled:   rowMap.get(event)?.push_enabled   ?? true,
  }));

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-0.5">Account and security</p>
      </div>

      {/* Account */}
      <div className="card divide-y divide-border">
        <div className="px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-text-secondary mb-3">
            Account
          </p>
          <div className="space-y-3">
            <ProfileName
              initialName={(profileRow as { full_name: string | null } | null)?.full_name ?? null}
            />
            <div className="space-y-1">
              <p className="text-xs text-text-muted">Email</p>
              <p className="text-sm text-text-primary">{user.email}</p>
            </div>
          </div>
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Password</p>
            <p className="text-xs text-text-muted">Change your account password</p>
          </div>
          <button className="btn-ghost text-xs" disabled>
            Change (P1.3)
          </button>
        </div>
      </div>

      {/* Security */}
      <div className="card divide-y divide-border">
        <div className="px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-text-secondary mb-1">
            Security
          </p>
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lock size={16} className="text-text-muted shrink-0" />
            <div>
              <p className="text-sm font-medium text-text-primary">Two-factor authentication</p>
              <p className="text-xs text-text-muted">TOTP authenticator app (optional)</p>
            </div>
          </div>
          <button className="btn-ghost text-xs" disabled>
            Enable (P1.3)
          </button>
        </div>
      </div>

      {/* Broker Accounts */}
      <div className="card divide-y divide-border">
        <div className="px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-text-secondary mb-0.5">
            Broker Accounts
          </p>
          <p className="text-xs text-text-muted">MT5 / MT4 accounts to copy signals into.</p>
        </div>
        <div className="px-4 py-4">
          <BrokerConnections
            initialConnections={(brokerConnections ?? []) as BrokerConnectionRow[]}
          />
        </div>
      </div>

      {/* Notifications */}
      <div className="card divide-y divide-border">
        <div className="px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-text-secondary mb-0.5">
            Notifications
          </p>
          <p className="text-xs text-text-muted">Choose which events trigger alerts.</p>
        </div>
        <PushManager />
        <NotificationPreferences initial={initialPrefs} />
      </div>

      {/* Danger zone */}
      <div className="card divide-y divide-border">
        <div className="px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-text-secondary mb-1">
            Session
          </p>
        </div>
        <div className="px-4 py-3">
          <form action={signOut}>
            <button
              type="submit"
              className="flex items-center gap-2 text-sm text-loss hover:opacity-80"
            >
              <LogOut size={14} />
              Sign out of all devices
            </button>
          </form>
        </div>
        <DeleteAccount />
      </div>

      <p className="text-xs text-text-muted">
        Telegram session management is in{" "}
        <span className="text-primary">Channels</span>.
      </p>
    </div>
  );
}
