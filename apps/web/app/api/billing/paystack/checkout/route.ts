import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { initializeTransaction, PAYSTACK_PLAN_CODES } from "@/lib/paystack";

type CheckoutPlan = "starter" | "pro" | "funded" | "lifetime";

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { plan?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const plan = body.plan as CheckoutPlan;
  const validPlans: CheckoutPlan[] = ["starter", "pro", "funded", "lifetime"];
  if (!validPlans.includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: userRow } = await (db as any).from("users").select("email, paystack_customer_code").eq("id", user.id).maybeSingle() as { data: { email: string; paystack_customer_code: string | null } | null };
  if (!userRow) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    let planCode: string | undefined;
    let amountKobo: number | undefined;

    if (plan === "lifetime") {
      const raw = process.env.PAYSTACK_LIFETIME_AMOUNT_KOBO;
      amountKobo = raw ? parseInt(raw, 10) : undefined;
      if (!amountKobo) return NextResponse.json({ error: "Lifetime amount not configured" }, { status: 500 });
    } else {
      planCode = PAYSTACK_PLAN_CODES[plan];
      if (!planCode) return NextResponse.json({ error: `Paystack plan code for '${plan}' not configured` }, { status: 500 });
    }

    const result = await initializeTransaction({
      email: userRow.email,
      planCode,
      amountKobo,
      metadata: {
        vouchfx_user_id: user.id,
        vouchfx_plan: plan,
      },
      callbackUrl: `${origin}/billing?paystack=success`,
    });

    return NextResponse.json({ url: result.authorization_url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Paystack error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
