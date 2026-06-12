import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CheckCircle2, AlertTriangle, Sparkles, ArrowUp } from "lucide-react";
import type { Metadata } from "next";
import BillingActions from "@/components/billing/BillingActions";
import PlanCheckout from "@/components/billing/PlanCheckout";
import InvoiceHistory from "@/components/billing/InvoiceHistory";
import type { InvoiceRow } from "@/components/billing/InvoiceHistory";
import { getEntitlements, type Plan } from "@vouchfx/core";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────────────────────────

function trialDaysLeft(trialEndsAt: string | null): number {
  if (!trialEndsAt) return 0;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtInvoiceDate(ts: number | string): string {
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function planLabel(key: string | undefined, isLifetime: boolean): string {
  if (isLifetime) return "Lifetime — One-time";
  const names: Record<string, string> = { starter: "Starter", pro: "Pro", funded: "Funded" };
  return key ? `${names[key] ?? capitalize(key)} — Monthly` : "Subscription";
}

async function fetchStripeInvoices(customerId: string): Promise<InvoiceRow[]> {
  try {
    const { stripe, PLAN_FROM_PRICE } = await import("@/lib/stripe");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = await (stripe.invoices.list as any)({
      customer: customerId,
      limit: 50,
      expand: ["data.charge"],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (list.data as any[]).flatMap((inv: any): InvoiceRow[] => {
      if (inv.status === "draft") return [];
      const linePrice = inv.lines?.data?.[0]?.price;
      const priceId: string = linePrice?.id ?? "";
      const plan = PLAN_FROM_PRICE[priceId];
      const isLifetime = !inv.subscription;
      const status: InvoiceRow["status"] =
        inv.status === "paid"  ? "paid"     :
        inv.status === "void"  ? "refunded" : "failed";

      const charge = typeof inv.charge === "object" ? inv.charge : null;
      let method = "Card";
      if (charge?.payment_method_details?.card) {
        const c = charge.payment_method_details.card;
        method = `${capitalize(c.brand ?? "Card")} ·· ${c.last4}`;
      } else if (charge?.payment_method_details?.type) {
        method = capitalize((charge.payment_method_details.type as string).replace(/_/g, " "));
      }

      return [{
        id: inv.id as string,
        date: fmtInvoiceDate(inv.created as number),
        plan: planLabel(plan, isLifetime),
        amount: `$${((inv.amount_paid as number) / 100).toFixed(2)}`,
        method,
        status,
        downloadUrl: (inv.hosted_invoice_url as string | null) ?? null,
      }];
    });
  } catch {
    return [];
  }
}

async function fetchPaystackInvoices(customerCode: string): Promise<InvoiceRow[]> {
  try {
    const { listTransactions, planFromCode } = await import("@/lib/paystack");
    const txns = await listTransactions(customerCode, 50);
    return txns.flatMap((txn): InvoiceRow[] => {
      if (txn.status === "abandoned") return [];
      const status: InvoiceRow["status"] = txn.status === "success" ? "paid" : "failed";

      const metadata = txn.metadata ?? {};
      const planHint = metadata.vouchfx_plan as string | undefined;
      const planKey = txn.plan?.plan_code ? planFromCode(txn.plan.plan_code) ?? planHint : planHint;
      const isLifetime = planKey === "lifetime";

      let method = "Paystack";
      const auth = txn.authorization;
      if (auth?.channel === "card" && auth.last4) {
        method = `${capitalize(auth.brand ?? auth.card_type ?? "Card")} ·· ${auth.last4}`;
      } else if (auth?.channel === "bank_transfer" || auth?.channel === "bank") {
        method = auth.bank ? `Bank — ${auth.bank}` : "Bank transfer";
      }

      const naira = txn.amount / 100;
      const dateStr = txn.paid_at ?? txn.created_at;

      return [{
        id: `ps_${txn.id}`,
        date: fmtInvoiceDate(dateStr),
        plan: planLabel(planKey ?? undefined, isLifetime),
        amount: `₦${Math.round(naira).toLocaleString("en-US")}`,
        method,
        status,
        downloadUrl: null,
      }];
    });
  } catch {
    return [];
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; cancelled?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [{ data: subRow }, { data: userRow }, { data: todayTradeRows }] = await Promise.all([
    db.from("subscriptions")
      .select("plan, status, current_period_end, trial_ends_at, cancelled_at, provider")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("users")
      .select("stripe_customer_id, paystack_customer_code")
      .eq("id", user.id)
      .maybeSingle(),
    db.from("trades")
      .select("parsed_signal_id")
      .neq("status", "SKIPPED")
      .gte("created_at", todayStart.toISOString()),
  ]);

  type SubRow = {
    plan: Plan;
    status: string;
    current_period_end: string | null;
    trial_ends_at: string | null;
    cancelled_at: string | null;
    provider: string;
  } | null;

  const sub = subRow as SubRow;
  const currentPlan: Plan = sub?.plan ?? "trial";
  const currentStatus: string = sub?.status ?? "trialing";
  const isTrial = currentPlan === "trial" || currentStatus === "trialing";
  const isActive = currentStatus === "active" || currentStatus === "trialing";
  const isPastDue = currentStatus === "past_due";
  const daysLeft = isTrial ? trialDaysLeft(sub?.trial_ends_at ?? null) : 0;
  const hasStripe = sub?.provider === "stripe";
  const trialExpired = isTrial && sub?.trial_ends_at
    ? new Date(sub.trial_ends_at) < new Date()
    : (currentStatus === "expired");
  const trialExpiringSoon = isTrial && !trialExpired && daysLeft > 0 && daysLeft <= 3;

  // Today's usage (distinct signals acted on) vs the plan's daily cap
  const signalsToday = new Set(
    ((todayTradeRows ?? []) as { parsed_signal_id: string }[]).map((r) => r.parsed_signal_id)
  ).size;
  const { maxSignalsPerDay } = getEntitlements(currentPlan);
  const usagePct = maxSignalsPerDay > 0 ? Math.min(100, Math.round((signalsToday / maxSignalsPerDay) * 100)) : 0;

  // Invoices
  const stripeCustomerId: string | null =
    (userRow as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;
  const paystackCustomerCode: string | null =
    (userRow as { paystack_customer_code?: string | null } | null)?.paystack_customer_code ?? null;

  const [stripeInvoices, paystackInvoices] = await Promise.all([
    stripeCustomerId ? fetchStripeInvoices(stripeCustomerId) : [],
    paystackCustomerCode ? fetchPaystackInvoices(paystackCustomerCode) : [],
  ]);

  const invoices: InvoiceRow[] = [...stripeInvoices, ...paystackInvoices].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const paystackPlanEnabled: Record<string, boolean> = {
    starter:  !!(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_PLAN_STARTER_CODE),
    pro:      !!(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_PLAN_PRO_CODE),
    funded:   !!(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_PLAN_FUNDED_CODE),
    lifetime: !!(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_LIFETIME_AMOUNT_KOBO),
  };

  return (
    <div className="mx-auto w-full max-w-[1080px]">
      {/* Heading */}
      <div className="mb-5">
        <h1 className="text-[20px] font-bold tracking-tight text-text-primary sm:text-[22px]">Billing &amp; plans</h1>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-text-secondary">
          Manage your subscription, switch plans, and review past invoices. Upgrades take effect immediately.
        </p>
      </div>

      <div className="flex flex-col gap-7">
        {/* Flash banners */}
        {trialExpired && (
          <div className="flex items-start gap-2 rounded-2xl border border-loss/30 bg-loss/5 px-4 py-3 text-sm text-loss">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>Your free trial has ended — signal execution is paused. Choose a plan below to continue.</span>
          </div>
        )}
        {params.success && (
          <div className="flex items-center gap-2 rounded-2xl border border-profit/30 bg-profit/5 px-4 py-3 text-sm text-profit">
            <CheckCircle2 size={15} />
            Payment confirmed — your plan is now active.
          </div>
        )}
        {params.cancelled && (
          <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
            Checkout cancelled — no charge was made.
          </div>
        )}
        {isPastDue && (
          <div className="rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
            Payment failed — execution is paused. Update your payment method to resume.
          </div>
        )}

        {/* Current plan hero */}
        <section className="overflow-hidden rounded-2xl border border-primary/30 bg-surface">
          <div className="grid-glow flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary-light">
                  <Sparkles size={12} /> {isTrial ? "Free trial" : `${capitalize(currentPlan)} plan`}
                </span>
                {isTrial ? (
                  <span className={`num inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${trialExpiringSoon || trialExpired ? "border-warning/30 bg-warning/[0.08] text-warning" : "border-border bg-surface text-text-secondary"}`}>
                    <span className={`live-dot h-1.5 w-1.5 rounded-full ${trialExpired ? "bg-loss" : "bg-warning"}`} />
                    {trialExpired ? "Expired" : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`}
                  </span>
                ) : (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${isActive ? "bg-profit/20 text-profit" : isPastDue ? "bg-warning/20 text-warning" : "bg-border text-text-muted"}`}>
                    {currentStatus}
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-[20px] font-bold tracking-tight text-text-primary sm:text-[22px]">
                {isTrial ? "You're on the Free trial" : `You're on ${capitalize(currentPlan)}`}
              </h2>
              <p className="mt-1 max-w-md text-[13px] leading-relaxed text-text-secondary">
                {isTrial ? (
                  <>Limited to <span className="font-semibold text-text-primary">1 signal per day</span> on a single
                    broker account. Upgrade to copy every signal across your channels with full risk automation.</>
                ) : sub?.current_period_end ? (
                  <>Renews {fmtDate(sub.current_period_end)}.</>
                ) : sub?.cancelled_at ? (
                  <>Cancelled {fmtDate(sub.cancelled_at)}.</>
                ) : (
                  <>Your subscription is active.</>
                )}
              </p>
              {hasStripe && !isTrial && (
                <div className="mt-3 max-w-[220px]">
                  <BillingActions action="portal" label="Manage subscription" />
                </div>
              )}
            </div>

            {/* Usage box */}
            <div className="shrink-0 sm:text-right">
              <div className="rounded-xl border border-border bg-bg/40 p-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Today&rsquo;s usage</div>
                <div className="num mt-1.5 flex items-baseline gap-1 sm:justify-end">
                  <span className="text-[26px] font-bold leading-none text-primary-light">{signalsToday}</span>
                  <span className="text-[13px] text-text-muted">
                    / {maxSignalsPerDay > 0 ? `${maxSignalsPerDay} signal${maxSignalsPerDay !== 1 ? "s" : ""}` : "unlimited"}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border sm:w-44">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${maxSignalsPerDay > 0 ? usagePct : signalsToday > 0 ? 100 : 0}%` }} />
                </div>
                <p className="mt-1.5 text-[11px] text-text-muted">Resets at 00:00 UTC</p>
              </div>
              {isTrial && (
                <a
                  href="#plans"
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-[#04201D] transition-colors hover:bg-primary-light"
                >
                  <ArrowUp size={16} strokeWidth={2.5} /> Upgrade now
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Plans + payment + checkout */}
        <PlanCheckout
          currentPlan={currentPlan}
          isActive={isActive && !isTrial}
          paystackPlanEnabled={paystackPlanEnabled}
          renewsAt={null}
        />

        {/* Invoice history */}
        <InvoiceHistory invoices={invoices} />
      </div>
    </div>
  );
}
