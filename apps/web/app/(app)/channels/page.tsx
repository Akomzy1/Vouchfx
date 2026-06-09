import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ConnectFlow from "@/components/telegram/ConnectFlow";
import ChannelList, { type ChannelSource } from "@/components/telegram/ChannelList";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Channels" };
export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Telegram session status (RLS: auth.uid() = user_id)
  const { data: session } = await db
    .from("telegram_sessions")
    .select("status, last_connected_at")
    .eq("user_id", user.id)
    .maybeSingle();

  type SessionStatus = "active" | "limited" | "banned" | "disconnected" | "none";
  const status: SessionStatus = session?.status ?? "none";
  const lastConnectedAt: string | null = session?.last_connected_at ?? null;
  const connected = status === "active" || status === "limited";

  // Signal sources for this user (only if connected)
  let initialSources: ChannelSource[] = [];
  if (connected) {
    const { data: sources } = await db
      .from("signal_sources")
      .select("id, telegram_chat_id, title, is_enabled, daily_signal_limit, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    initialSources = (sources ?? []).map((s: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      ...s,
      telegram_chat_id: String(s.telegram_chat_id),
    }));
  }

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

      {/* Channel list — only shown when Telegram is connected */}
      {connected && (
        <ChannelList initialSources={initialSources} />
      )}
    </div>
  );
}
