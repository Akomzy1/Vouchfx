import { NextResponse } from "next/server";
import { verifyWebhookSignature, verifyTransaction, planFromCode } from "@/lib/paystack";
import { createServiceClient } from "@/lib/supabase/service";
import { accrueCommission } from "@/lib/referral";
import { PLAN_USD_PRICE } from "@vouchfx/core";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event: string; data: Record<string, unknown> };
  try { event = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const db = createServiceClient();

  try {
    if (event.event === "charge.success") {
      await handleChargeSuccess(db, event.data);
    } else if (event.event === "subscription.not_renew" || event.event === "subscription.disable") {
      await handleSubscriptionCancelled(db, event.data);
    }
    // Other events are acknowledged but ignored
  } catch (err) {
    console.error("[paystack-webhook] handler error", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleChargeSuccess(db: ReturnType<typeof createServiceClient>, data: Record<string, unknown>) {
  const reference = data.reference as string;
  if (!reference) return;

  const txn = await verifyTransaction(reference);
  if (txn.status !== "success") return;

  const metadata = txn.metadata as Record<string, unknown> | undefined;
  const userId = metadata?.vouchfx_user_id as string | undefined;
  const planHint = metadata?.vouchfx_plan as string | undefined;

  if (!userId) return;

  // Determine plan from plan code if it's a subscription, else from metadata hint
  let plan: "starter" | "pro" | "funded" | "lifetime" | null = null;
  if (txn.plan?.plan_code) {
    plan = planFromCode(txn.plan.plan_code);
  }
  if (!plan && planHint === "lifetime") plan = "lifetime";
  if (!plan) return;

  // Store paystack_customer_code if we haven't yet
  const customerCode = txn.customer.customer_code;
  await db.from("users").update({ paystack_customer_code: customerCode }).eq("id", userId);

  // Commission accrual (fire-and-forget — never block subscription update).
  // Paystack charges NGN: txn.amount is kobo, NOT cents, so dividing by 100
  // would credit naira as dollars (~1,600× too high). Commission is 20% of the
  // plan's canonical USD price — stable, FX-independent, and identical to what
  // the same plan earns via Stripe. Only trust amount/100 for real USD charges.
  const amountUsd = txn.currency === "USD" ? txn.amount / 100 : PLAN_USD_PRICE[plan];
  // Idempotent on the Paystack reference — a payment earns at most one commission.
  accrueCommission(db, userId, amountUsd, `ps_${txn.reference}`).catch(() => undefined);

  // For lifetime (one-off payment) insert a permanent subscription
  if (plan === "lifetime") {
    await db.from("subscriptions").upsert(
      {
        user_id: userId,
        plan: "lifetime",
        status: "active",
        provider: "paystack",
        provider_subscription_id: txn.reference,
        provider_customer_id: customerCode,
        current_period_start: new Date().toISOString(),
        current_period_end: null,
        trial_ends_at: null,
        cancelled_at: null,
      },
      { onConflict: "user_id" }
    );
    return;
  }

  // Recurring subscription — upsert with subscription_code as the provider_subscription_id
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await db.from("subscriptions").upsert(
    {
      user_id: userId,
      plan,
      status: "active",
      provider: "paystack",
      provider_subscription_id: txn.subscription_code ?? txn.reference,
      provider_customer_id: customerCode,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      trial_ends_at: null,
      cancelled_at: null,
    },
    { onConflict: "user_id" }
  );
}

async function handleSubscriptionCancelled(db: ReturnType<typeof createServiceClient>, data: Record<string, unknown>) {
  const subscriptionCode = data.subscription_code as string | undefined;
  if (!subscriptionCode) return;

  await db
    .from("subscriptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("provider_subscription_id", subscriptionCode)
    .eq("provider", "paystack");
}
