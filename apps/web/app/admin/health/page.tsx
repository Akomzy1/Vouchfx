/**
 * Admin health view (VCH-ADM-01)
 * Route: /admin/health — accessible only to ADMIN_EMAILS.
 *
 * Shows per-user TG + broker status and worker heartbeats.
 * Server component — data fetched at render time.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import AdminHealthClient from "@/components/admin/AdminHealthClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Health" };
export const dynamic = "force-dynamic";

function isAdmin(email: string | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());
  return list.includes(email.toLowerCase());
}

export default async function AdminHealthPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdmin(user.email)) redirect("/dashboard");

  const svc = createServiceClient();

  const [
    { data: users },
    { data: sessions },
    { data: brokers },
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
    (svc as any).from("trades").select("user_id, created_at").order("created_at", { ascending: false }).limit(500),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any)
      .from("audit_events")
      .select("user_id, created_at")
      .eq("event_type", "error")
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString()),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any).from("worker_heartbeats").select("worker_id, worker_type, last_seen_at, metadata"),
  ]);

  // Build per-user health
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionMap = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of (sessions ?? []) as any[]) sessionMap.set(s.user_id as string, s);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brokerMap = new Map<string, any[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (brokers ?? []) as any[]) {
    if (!brokerMap.has(b.user_id as string)) brokerMap.set(b.user_id as string, []);
    brokerMap.get(b.user_id as string)!.push(b);
  }

  const lastTradeMap = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (trades ?? []) as any[]) {
    if (!lastTradeMap.has(t.user_id as string)) lastTradeMap.set(t.user_id as string, t.created_at as string);
  }

  const errorCountMap = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (errors ?? []) as any[]) {
    errorCountMap.set(e.user_id as string, (errorCountMap.get(e.user_id as string) ?? 0) + 1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userHealth = ((users ?? []) as any[]).map((u) => {
    const session = sessionMap.get(u.id as string);
    const userBrokers = brokerMap.get(u.id as string) ?? [];
    const activeBroker = userBrokers.find((b) => b.is_active);
    return {
      user_id: u.id as string,
      email: u.email as string,
      joined_at: u.created_at as string,
      tg_status: (session?.status as string) ?? "none",
      tg_last_connected: (session?.last_connected_at as string | null) ?? null,
      broker_active: Boolean(activeBroker),
      broker_last_synced: (activeBroker?.last_synced_at as string | null) ?? null,
      last_trade_at: lastTradeMap.get(u.id as string) ?? null,
      errors_24h: errorCountMap.get(u.id as string) ?? 0,
    };
  });

  const STALE_MS = 60_000;
  const now = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workerHealth = ((heartbeats ?? []) as any[]).map((h) => ({
    worker_id: h.worker_id as string,
    worker_type: h.worker_type as string,
    last_seen_at: h.last_seen_at as string,
    stale_ms: now - new Date(h.last_seen_at as string).getTime(),
    healthy: now - new Date(h.last_seen_at as string).getTime() < STALE_MS,
  }));

  return (
    <AdminHealthClient users={userHealth} workers={workerHealth} />
  );
}
