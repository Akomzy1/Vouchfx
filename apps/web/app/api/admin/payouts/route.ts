/**
 * GET /api/admin/payouts — list payout requests for the admin console
 * (VCH-ADMIN-02). Optional ?status= filter.
 */
import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await requireAdminRoute();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = new URL(request.url).searchParams.get("status");
  const svc = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (svc as any)
    .from("payouts")
    .select("id, user_id, amount_usd, status, method, provider_transfer_id, failure_reason, processed_by, paid_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);

  const { data: payouts, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Decorate with affiliate email + referral code (service role; no RLS).
  const userIds = [...new Set((payouts ?? []).map((p: { user_id: string }) => p.user_id))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: users } = await (svc as any)
    .from("users")
    .select("id, email, referral_code")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const userMap = new Map(
    ((users ?? []) as { id: string; email: string; referral_code: string | null }[]).map((u) => [u.id, u])
  );

  const rows = (payouts ?? []).map((p: { user_id: string }) => ({
    ...p,
    affiliate_email: userMap.get(p.user_id)?.email ?? null,
    referral_code: userMap.get(p.user_id)?.referral_code ?? null,
  }));

  return NextResponse.json({ payouts: rows });
}
