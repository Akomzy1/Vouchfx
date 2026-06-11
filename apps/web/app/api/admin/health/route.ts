/**
 * GET /api/admin/health
 * Returns per-user health summary + worker heartbeats.
 * Requires caller to be in ADMIN_EMAILS. Service-role only.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

function isAdmin(email: string | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());
  return list.includes(email.toLowerCase());
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const svc = createServiceClient();

  const [
    { data: users },
    { data: sessions },
    { data: brokers },
    { data: signals },
    { data: trades },
    { data: errors },
    { data: heartbeats },
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any).from("users").select("id, email, created_at").order("created_at", { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any).from("telegram_sessions").select("user_id, status, last_connected_at"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any).from("broker_connections").select("user_id, is_active, last_synced_at"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any).from("parsed_signals").select("source_id, created_at").order("created_at", { ascending: false }).limit(500),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any).from("trades").select("user_id, created_at").order("created_at", { ascending: false }).limit(500),
    // Errors: audit_events with type "error" in last 24h
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any)
      .from("audit_events")
      .select("user_id, created_at")
      .eq("event_type", "error")
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString()),
    // Worker heartbeats
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any).from("worker_heartbeats").select("worker_id, worker_type, last_seen_at, metadata"),
  ]);

  // Build per-user health summary
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionMap = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of (sessions ?? []) as any[]) sessionMap.set(s.user_id, s);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brokerMap = new Map<string, any[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (brokers ?? []) as any[]) {
    if (!brokerMap.has(b.user_id)) brokerMap.set(b.user_id, []);
    brokerMap.get(b.user_id)!.push(b);
  }

  // Last signal per user (via source_id → need signal_sources for user mapping)
  // Use trades for last activity instead since they carry user_id directly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastTradeMap = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (trades ?? []) as any[]) {
    if (!lastTradeMap.has(t.user_id)) lastTradeMap.set(t.user_id, t.created_at as string);
  }

  const errorCountMap = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (errors ?? []) as any[]) {
    errorCountMap.set(e.user_id, (errorCountMap.get(e.user_id) ?? 0) + 1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userHealth = ((users ?? []) as any[]).map((u) => {
    const session = sessionMap.get(u.id as string);
    const userBrokers = brokerMap.get(u.id as string) ?? [];
    const activeBroker = userBrokers.find((b) => b.is_active);
    return {
      user_id: u.id,
      email: u.email,
      joined_at: u.created_at,
      tg_status: session?.status ?? "none",
      tg_last_connected: session?.last_connected_at ?? null,
      broker_active: Boolean(activeBroker),
      broker_last_synced: activeBroker?.last_synced_at ?? null,
      last_trade_at: lastTradeMap.get(u.id as string) ?? null,
      errors_24h: errorCountMap.get(u.id as string) ?? 0,
    };
  });

  // Worker health
  const STALE_MS = 60_000;
  const now = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workerHealth = ((heartbeats ?? []) as any[]).map((h) => ({
    worker_id: h.worker_id,
    worker_type: h.worker_type,
    last_seen_at: h.last_seen_at,
    stale_ms: now - new Date(h.last_seen_at as string).getTime(),
    healthy: now - new Date(h.last_seen_at as string).getTime() < STALE_MS,
    metadata: h.metadata,
  }));

  return NextResponse.json({ users: userHealth, workers: workerHealth });
}
