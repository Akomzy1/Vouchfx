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

  const affId = (aff as { id: string }).id;

  // Insert payout request and zero out pending balance atomically
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: payoutErr } = await (serviceDb as any)
    .from("payouts")
    .insert({
      affiliate_account_id: affId,
      user_id: user.id,
      amount_usd: pending,
      status: "pending",
      method,
    });

  if (payoutErr) return NextResponse.json({ error: "Failed to create payout request" }, { status: 500 });

  // Zero out pending balance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceDb as any)
    .from("affiliate_accounts")
    .update({ pending_payout_usd: 0 })
    .eq("id", affId);

  // Update preferred payout method
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceDb as any)
    .from("affiliate_accounts")
    .update({ payout_method: method })
    .eq("id", affId);

  return NextResponse.json({ ok: true, amount_usd: pending });
}
