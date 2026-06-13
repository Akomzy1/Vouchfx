/**
 * POST /api/admin/subscriptions — admin subscription actions (VCH-ADMIN-07).
 *
 * Body: { userId, action: "cancel" | "refund" }
 *   cancel → Stripe: cancel at period end. Paystack: marked cancelled in our DB
 *            (disable it from the Paystack dashboard — we don't store the email
 *            token the disable API needs).
 *   refund → Stripe only: refund the latest paid invoice's charge; commission
 *            clawback runs via the existing Stripe webhook on charge.refunded.
 *
 * Every action is written to audit_events. Disbursement/refund money movement
 * is performed by the provider; we record intent + result.
 */
import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { writeAuditEvent } from "@vouchfx/db";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const admin = await requireAdminRoute();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { userId?: string; action?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { userId, action } = body;
  if (!userId || (action !== "cancel" && action !== "refund")) {
    return NextResponse.json({ error: "userId and a valid action are required" }, { status: 400 });
  }

  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sub } = await (svc as any)
    .from("subscriptions")
    .select("plan, status, provider, provider_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!sub) return NextResponse.json({ error: "No subscription for this user" }, { status: 404 });

  const s = sub as { plan: string; status: string; provider: string; provider_subscription_id: string | null };
  let result = "";

  try {
    if (action === "cancel") {
      if (s.provider === "stripe" && s.provider_subscription_id) {
        await stripe.subscriptions.update(s.provider_subscription_id, { cancel_at_period_end: true });
        result = "stripe: cancel_at_period_end";
      } else {
        result = `${s.provider}: marked cancelled in DB (disable in provider dashboard)`;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (svc as any)
        .from("subscriptions")
        .update({ cancelled_at: new Date().toISOString(), status: "cancelled" })
        .eq("user_id", userId);

    } else {
      // refund (Stripe only)
      if (s.provider !== "stripe" || !s.provider_subscription_id) {
        return NextResponse.json({ error: "Automated refund is supported for Stripe only. Refund Paystack from its dashboard." }, { status: 422 });
      }
      const invoices = await stripe.invoices.list({ subscription: s.provider_subscription_id, limit: 1, status: "paid" });
      // `charge` is present at runtime but absent from the Invoice type in this
      // SDK's pinned API version — read it defensively.
      const inv = invoices.data[0] as unknown as { charge?: string | { id: string } } | undefined;
      const charge = inv?.charge;
      if (!charge) return NextResponse.json({ error: "No paid charge found to refund." }, { status: 404 });
      const refund = await stripe.refunds.create({ charge: typeof charge === "string" ? charge : charge.id });
      result = `stripe: refunded ${refund.id}`;
    }
  } catch (err) {
    return NextResponse.json({ error: `Provider error: ${(err as Error).message}` }, { status: 502 });
  }

  await writeAuditEvent(svc, {
    userId,
    eventType: action === "cancel" ? "subscription_cancelled" : "subscription_refunded",
    payload: { plan: s.plan, provider: s.provider, result, processed_by: admin.email ?? admin.id },
  });

  return NextResponse.json({ ok: true, result });
}
