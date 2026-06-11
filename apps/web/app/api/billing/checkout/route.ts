/**
 * POST /api/billing/checkout
 * Creates a Stripe Checkout Session and returns the redirect URL.
 *
 * Body: { plan: "starter" | "pro" | "funded" | "lifetime" }
 *
 * Note (PRD R10): Stripe billing runs through a non-Nigerian entity (UK Ltd or US LLC).
 * Stripe Tax is enabled at the session level.
 * VCH-REF-06: If the user was referred, applies a 20% first-month discount coupon.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { stripe, STRIPE_PRICES } from "@/lib/stripe";

const SUBSCRIPTION_PLANS = ["starter", "pro", "funded"] as const;
const ALL_PLANS = [...SUBSCRIPTION_PLANS, "lifetime"] as const;

type BillingPlan = (typeof ALL_PLANS)[number];

/** Get or create the Stripe coupon for 20% off first month (VCH-REF-06). */
async function getReferralCouponId(): Promise<string> {
  const COUPON_ID = "VOUCHFX_REFERRED20";
  try {
    await stripe.coupons.retrieve(COUPON_ID);
    return COUPON_ID;
  } catch {
    const coupon = await stripe.coupons.create({
      id:        COUPON_ID,
      percent_off: 20,
      duration:  "once",
      name:      "Referral — 20% off first month",
    });
    return coupon.id;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { plan?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const plan = body.plan as BillingPlan | undefined;
  if (!plan || !(ALL_PLANS as readonly string[]).includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const priceId = STRIPE_PRICES[plan];
  if (!priceId) {
    return NextResponse.json({ error: `Price not configured for plan: ${plan}` }, { status: 503 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Look up or create Stripe customer
  const { data: userRow } = await db
    .from("users")
    .select("email, stripe_customer_id")
    .eq("id", user.id)
    .single();

  let customerId: string | undefined = (userRow as { stripe_customer_id?: string } | null)?.stripe_customer_id ?? undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: (userRow as { email?: string } | null)?.email ?? user.email ?? undefined,
      metadata: { vouchfx_user_id: user.id },
    });
    customerId = customer.id;
    await db.from("users").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  // VCH-REF-06: check if this user was referred and hasn't yet had the discount applied
  let discountCouponId: string | undefined;
  if (plan !== "lifetime") {
    try {
      const serviceDb = createServiceClient();
      const { data: referralRow } = await serviceDb
        .from("referrals")
        .select("id, first_month_discount_applied")
        .eq("referee_id", user.id)
        .maybeSingle();

      const r = referralRow as { id: string; first_month_discount_applied: boolean } | null;
      if (r && !r.first_month_discount_applied) {
        discountCouponId = await getReferralCouponId();
        // Mark discount as applied
        await serviceDb.from("referrals")
          .update({ first_month_discount_applied: true })
          .eq("id", r.id);
      }
    } catch {
      // Discount check failure must never block checkout
    }
  }

  const origin = request.headers.get("origin") ?? "https://vouchfx.com";
  const isLifetime = plan === "lifetime";

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: isLifetime ? "payment" : "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    automatic_tax: { enabled: true },
    customer_update: { address: "auto" },
    success_url: `${origin}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/billing?cancelled=true`,
    metadata: {
      vouchfx_user_id: user.id,
      vouchfx_plan: plan,
    },
    ...(isLifetime
      ? {}
      : {
          subscription_data: {
            metadata: { vouchfx_user_id: user.id, vouchfx_plan: plan },
            ...(discountCouponId ? { coupon: discountCouponId } : {}),
          },
        }),
  });

  return NextResponse.json({ url: session.url });
}
