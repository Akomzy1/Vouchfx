/**
 * GET /api/admin/users/lookup?q=<email or id> — support lookup (VCH-ADMIN-04).
 * Returns, for each match, a bundle: plan/subscription, broker + Telegram
 * connection status, recent signals/trades, and referral/affiliate state.
 */
import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await requireAdminRoute();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ users: [] });

  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = svc as any;

  // Match by email (partial, case-insensitive) or exact id.
  const isUuid = /^[0-9a-f-]{36}$/i.test(q);
  let userQuery = sb.from("users").select("id, email, full_name, referral_code, created_at, onboarding_completed_at").limit(10);
  userQuery = isUuid ? userQuery.eq("id", q) : userQuery.ilike("email", `%${q}%`);
  const { data: users, error } = await userQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = ((users ?? []) as { id: string }[]).map((u) => u.id);
  if (ids.length === 0) return NextResponse.json({ users: [] });

  const since = new Date(Date.now() - 30 * 864e5).toISOString();

  const [subs, brokers, sessions, trades, affiliates, referredBy] = await Promise.all([
    sb.from("subscriptions").select("user_id, plan, status, provider, current_period_end, trial_ends_at, cancelled_at").in("user_id", ids),
    sb.from("broker_connections").select("user_id, label, platform, is_active, status, account_mode, is_primary, last_balance_usd, last_synced_at").in("user_id", ids),
    sb.from("telegram_sessions").select("user_id, status, last_connected_at").in("user_id", ids),
    sb.from("trades").select("user_id, symbol, side, status, created_at").in("user_id", ids).gte("created_at", since).order("created_at", { ascending: false }).limit(100),
    sb.from("affiliate_accounts").select("user_id, referral_code, total_signups, total_active_referrals, pending_payout_usd, locked_payout_usd, lifetime_paid_usd").in("user_id", ids),
    sb.from("referrals").select("referee_id, referrer_id, status, created_at").in("referee_id", ids),
  ]);

  const by = <T extends { user_id: string }>(rows: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const r of rows ?? []) (m.get(r.user_id) ?? m.set(r.user_id, []).get(r.user_id)!).push(r);
    return m;
  };
  const subMap = by(subs.data);
  const brokerMap = by(brokers.data);
  const sessionMap = by(sessions.data);
  const tradeMap = by(trades.data);
  const affMap = by(affiliates.data);
  const refMap = new Map<string, { referrer_id: string; status: string }>();
  for (const r of (referredBy.data ?? []) as { referee_id: string; referrer_id: string; status: string }[]) {
    refMap.set(r.referee_id, { referrer_id: r.referrer_id, status: r.status });
  }

  const result = ((users ?? []) as {
    id: string; email: string; full_name: string | null; referral_code: string | null;
    created_at: string; onboarding_completed_at: string | null;
  }[]).map((u) => {
    const userTrades = tradeMap.get(u.id) ?? [];
    return {
      ...u,
      subscription: (subMap.get(u.id) ?? [])[0] ?? null,
      brokers: brokerMap.get(u.id) ?? [],
      telegram: (sessionMap.get(u.id) ?? [])[0] ?? null,
      trades_30d: userTrades.length,
      recent_trades: userTrades.slice(0, 8),
      affiliate: (affMap.get(u.id) ?? [])[0] ?? null,
      referred_by: refMap.get(u.id) ?? null,
    };
  });

  return NextResponse.json({ users: result });
}
