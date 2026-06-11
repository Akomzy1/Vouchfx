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

  let initialSources: ChannelSource[] = [];
  if (connected) {
    // Fetch sources (exclude those with a pending kill-close — executor is handling them)
    const { data: sources } = await db
      .from("signal_sources")
      .select("id, telegram_chat_id, title, is_enabled, daily_signal_limit, demo_until, override_risk_enabled, override_risk_pct, created_at")
      .eq("user_id", user.id)
      .is("kill_close_requested_at", null)
      .order("created_at", { ascending: false });

    if (sources && sources.length > 0) {
      // Count today's signals per source
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const { data: counts } = await db
        .from("parsed_signals")
        .select("source_id")
        .in("source_id", (sources as any[]).map((s: any) => s.id))
        .eq("is_signal", true)
        .gte("created_at", today.toISOString());

      const signalCounts = new Map<string, number>();
      for (const row of (counts ?? []) as { source_id: string }[]) {
        signalCounts.set(row.source_id, (signalCounts.get(row.source_id) ?? 0) + 1);
      }

      initialSources = (sources as any[]).map((s: any) => ({
        id:                   s.id,
        telegram_chat_id:     String(s.telegram_chat_id),
        title:                s.title,
        is_enabled:           s.is_enabled,
        daily_signal_limit:   s.daily_signal_limit,
        demo_until:           s.demo_until,
        override_risk_enabled: s.override_risk_enabled ?? false,
        override_risk_pct:    s.override_risk_pct ?? null,
        signals_today:        signalCounts.get(s.id) ?? 0,
      }));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Channels</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Manage the Telegram channels you copy signals from.
        </p>
      </div>

      <ConnectFlow initialStatus={status} lastConnectedAt={lastConnectedAt} />

      {connected && (
        <ChannelList initialSources={initialSources} />
      )}
    </div>
  );
}
