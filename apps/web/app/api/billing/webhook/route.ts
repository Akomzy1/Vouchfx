/**
 * POST /api/billing/webhook
 * Stripe webhook handler — verifies signature, then upserts subscription state.
 *
 * Handled events:
 *   checkout.session.completed          — subscription started / lifetime purchased
 *   customer.subscription.updated       — renewal, plan change, status change
 *   customer.subscription.deleted       — cancellation
 *   invoice.payment_succeeded           — recurring payment → commission accrual
 *   invoice.payment_failed              — move to past_due
 *   charge.refunded                     — cancellation + commission clawback
 */
import { NextResponse } from "next/server";
import { stripe, PLAN_FROM_PRICE } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { accrueCommission, clawbackCommission } from "@/lib/referral";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.text();
  const sig  = request.headers.get("stripe-signature") ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = createServiceClient();

  try {
    switch (event.type) {

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId  = session.metadata?.vouchfx_user_id;
        const plan    = session.metadata?.vouchfx_plan as "starter" | "pro" | "funded" | "lifetime" | undefined;

        if (!userId || !plan) break;

        if (plan === "lifetime") {
          await upsertSubscription(db, userId, {
            plan:                    "lifetime",
            status:                  "active",
            provider:                "stripe",
            provider_subscription_id: session.payment_intent as string | null ?? null,
            provider_customer_id:    session.customer as string | null ?? null,
          });
          // Commission on lifetime purchase
          if (session.amount_total) {
            const amountUsd = session.amount_total / 100;
            await accrueCommission(db, userId, amountUsd).catch(() => undefined);
          }
        }
        // Recurring: subscription.updated fires next with full subscription data
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpsert(db, sub);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.vouchfx_user_id;
        if (!userId) break;
        await upsertSubscription(db, userId, {
          plan:                    planFromSub(sub) ?? "starter",
          status:                  "cancelled",
          provider:                "stripe",
          provider_subscription_id: sub.id,
          provider_customer_id:    sub.customer as string,
          cancelled_at:            new Date().toISOString(),
        });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const userId  = invoice.metadata?.vouchfx_user_id
          ?? (invoice as { subscription_details?: { metadata?: { vouchfx_user_id?: string } } })
              .subscription_details?.metadata?.vouchfx_user_id;

        if (userId && invoice.amount_paid > 0) {
          const amountUsd = invoice.amount_paid / 100;
          await accrueCommission(db, userId, amountUsd).catch(() => undefined);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as { subscription?: string }).subscription;
        if (!subId) break;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("provider_subscription_id", subId)
          .eq("provider", "stripe");
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const customerId = charge.customer as string | null;
        if (!customerId) break;

        // Look up user by stripe_customer_id for commission clawback
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: userRow } = await (db as any)
          .from("users")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (userRow) {
          const amountUsd = charge.amount_refunded / 100;
          await clawbackCommission(db, (userRow as { id: string }).id, amountUsd).catch(() => undefined);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)
          .from("subscriptions")
          .update({ status: "cancelled" })
          .eq("provider_customer_id", customerId)
          .eq("provider", "stripe")
          .eq("status", "active");
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] handler error for ${event.type}:`, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function planFromSub(sub: Stripe.Subscription): "starter" | "pro" | "funded" | null {
  const priceId = sub.items.data[0]?.price?.id;
  return priceId ? (PLAN_FROM_PRICE[priceId] ?? null) : null;
}

function stripeStatusToInternal(
  status: Stripe.Subscription.Status
): "trialing" | "active" | "past_due" | "cancelled" | "expired" {
  switch (status) {
    case "trialing":          return "trialing";
    case "active":            return "active";
    case "past_due":          return "past_due";
    case "canceled":          return "cancelled";
    case "unpaid":            return "past_due";
    case "incomplete_expired":return "expired";
    default:                  return "past_due";
  }
}

async function handleSubscriptionUpsert(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  sub: Stripe.Subscription
) {
  const userId = sub.metadata?.vouchfx_user_id;
  if (!userId) return;

  const plan = planFromSub(sub);
  if (!plan) return;

  // In Stripe API 2026-05-27.dahlia, period dates moved to SubscriptionItem
  const firstItem = sub.items.data[0];
  const periodStart = firstItem?.current_period_start;
  const periodEnd   = firstItem?.current_period_end;

  await upsertSubscription(db, userId, {
    plan,
    status:                   stripeStatusToInternal(sub.status),
    provider:                 "stripe",
    provider_subscription_id: sub.id,
    provider_customer_id:     sub.customer as string,
    current_period_start:     periodStart ? new Date(periodStart * 1000).toISOString() : undefined,
    current_period_end:       periodEnd   ? new Date(periodEnd   * 1000).toISOString() : undefined,
    trial_ends_at:            sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    cancelled_at:             sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
  });
}

async function upsertSubscription(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  data: {
    plan: string;
    status: string;
    provider: string;
    provider_subscription_id?: string | null;
    provider_customer_id?: string | null;
    current_period_start?: string;
    current_period_end?: string;
    trial_ends_at?: string | null;
    cancelled_at?: string | null;
  }
) {
  await db
    .from("subscriptions")
    .upsert(
      { user_id: userId, ...data },
      { onConflict: "user_id" }
    );
}
