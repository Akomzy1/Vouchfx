import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const PAYOUT_MINIMUM_USD = 50;
const VALID_METHODS = ["stripe", "paystack", "bank_transfer"] as const;
type PayoutMethod = (typeof VALID_METHODS)[number];

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { method?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const method = body.method as PayoutMethod;
  if (!VALID_METHODS.includes(method)) {
    return NextResponse.json({ error: "Invalid payout method" }, { status: 400 });
  }

  const serviceDb = createServiceClient();

  // Mature any commissions past their refund window first, so the balance check
  // below sees up-to-date funds (idempotent).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceDb as any).rpc("fn_settle_matured_commissions").catch(() => undefined);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: aff } = await (serviceDb as any)
    .from("affiliate_accounts")
    .select("id, pending_payout_usd")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!aff) return NextResponse.json({ error: "No affiliate account" }, { status: 404 });

  const pending = Number((aff as { id: string; pending_payout_usd: number }).pending_payout_usd);

  if (pending < PAYOUT_MINIMUM_USD) {
    return NextResponse.json({
      error: `Minimum payout is $${PAYOUT_MINIMUM_USD}. Current balance: $${pending.toFixed(2)}`,
      code: "below_minimum",
    }, { status: 400 });
  }

  // Atomic: move the full pending balance into the locked/processing state and
  // create the payout row (VCH-ADMIN-03). The amount is NOT zeroed-and-lost —
  // it stays as locked_payout_usd until an admin marks the payout PAID, and is
  // returned to pending automatically if the payout is marked FAILED.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rpcErr } = await (serviceDb as any).rpc("fn_request_payout", {
    p_user_id: user.id,
    p_amount: pending,
    p_method: method,
  });

  if (rpcErr) {
    const msg = rpcErr.message?.includes("insufficient_balance")
      ? "Balance changed — please refresh and try again."
      : "Failed to create payout request";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, amount_usd: pending });
}
