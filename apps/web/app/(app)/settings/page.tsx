import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth/actions";
import { Lock, LogOut } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
          <div className="space-y-1">
            <p className="text-xs text-text-muted">Email</p>
            <p className="text-sm text-text-primary">{user.email}</p>
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
      </div>

      <p className="text-xs text-text-muted">
        Broker connection and Telegram session management are in{" "}
        <span className="text-primary">Channels</span> and coming in P1.3–P1.4.
      </p>
    </div>
  );
}
