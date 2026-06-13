import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import PayoutsConsole, { type AdminPayout } from "@/components/admin/PayoutsConsole";

export const metadata: Metadata = { title: "Admin — Payouts" };
export const dynamic = "force-dynamic";

export default async function AdminPayoutsPage() {
  await requireAdminPage(); // admin-only section (layout only requires staff)

  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: payouts } = await (svc as any)
    .from("payouts")
    .select("id, user_id, amount_usd, status, method, provider_transfer_id, failure_reason, processed_by, paid_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const userIds = [...new Set(((payouts ?? []) as { user_id: string }[]).map((p) => p.user_id))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: users } = await (svc as any)
    .from("users")
    .select("id, email, referral_code")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const userMap = new Map(
    ((users ?? []) as { id: string; email: string; referral_code: string | null }[]).map((u) => [u.id, u])
  );

  const rows: AdminPayout[] = ((payouts ?? []) as Omit<AdminPayout, "affiliate_email" | "referral_code">[]).map((p) => ({
    ...p,
    affiliate_email: userMap.get(p.user_id)?.email ?? null,
    referral_code: userMap.get(p.user_id)?.referral_code ?? null,
  }));

  return <PayoutsConsole initial={rows} />;
}
