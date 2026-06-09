import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ConnectFlow from "@/components/telegram/ConnectFlow";
import { Radio } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Channels" };
export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Read user's Telegram session status (RLS: auth.uid() = user_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: session } = await db
    .from("telegram_sessions")
    .select("status, last_connected_at")
    .eq("user_id", user.id)
    .maybeSingle();

  type SessionStatus = "active" | "limited" | "banned" | "disconnected" | "none";
  const status: SessionStatus = session?.status ?? "none";
  const lastConnectedAt: string | null = session?.last_connected_at ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Channels</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Manage the Telegram channels you copy signals from.
        </p>
      </div>

      {/* Telegram connection card */}
      <ConnectFlow initialStatus={status} lastConnectedAt={lastConnectedAt} />

      {/* Channel list — populated in P1.4/P1.5 after the listener pool is built */}
      {status !== "none" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-primary">Your channels</p>
          </div>
          <div className="card p-8 text-center space-y-2">
            <Radio size={24} className="mx-auto text-text-muted" />
            <p className="text-sm text-text-muted">
              Channel discovery coming in P1.5.
            </p>
            <p className="text-xs text-text-muted">
              Once available, VouchFX will list all channels you belong to so you can choose which ones to copy.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
