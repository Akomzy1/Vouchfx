import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import PerformanceView, { type AccountOpt } from "@/components/performance/PerformanceView";

export const metadata: Metadata = { title: "Performance" };
export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db
    .from("broker_connections")
    .select("id, label, account_mode, is_primary")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  const accounts: AccountOpt[] = ((data ?? []) as Array<{ id: string; label: string | null; account_mode: string | null; is_primary: boolean | null }>).map(
    (a) => ({
      id: a.id,
      label: a.label,
      accountMode: a.account_mode === "demo" || a.account_mode === "live" ? a.account_mode : null,
      isPrimary: a.is_primary === true,
    })
  );

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[20px] font-bold tracking-tight text-text-primary sm:text-[22px]">Performance</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Realised P&amp;L by day and by channel. Figures come from your closed trades — demo and live are kept separate.
        </p>
      </div>
      <PerformanceView accounts={accounts} />
    </div>
  );
}
