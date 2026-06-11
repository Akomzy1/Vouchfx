import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CheckCircle2, CreditCard, Zap, Shield, Star, AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import BillingActions from "@/components/billing/BillingActions";
import PaystackActions from "@/components/billing/PaystackActions";
import InvoiceHistory from "@/components/billing/InvoiceHistory";
import type { InvoiceRow } from "@/components/billing/InvoiceHistory";
import type { Plan } from "@vouchfx/core";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

// ── Feature table (display only) ──────────────────────────────────────────────

interface PlanMeta {
  key: "starter" | "pro" | "funded" | "lifetime";
  name: string;
  price: string;
  period: string;
  brokers: number;
  prop: boolean;
  priority: boolean;
  popular?: boolean;
  features: string[];
}

const PLANS: PlanMeta[] = [
  {
    key: "starter", name: "Starter", price: "$19", period: "/mo",
    brokers: 1, prop: false, priority: false,
    features: ["1 broker account", "Unlimited signals/day", "Text + vision parsing", "Full audit log", "Naira checkout"],
  },
  {
    key: "pro", name: "Pro", price: "$39", period: "/mo",
    brokers: 3, prop: true, priority: true, popular: true,
    features: ["3 broker accounts", "Unlimited signals/day", "Drawdown guardian", "Priority execution region", "News filter (Phase 2)"],
  },
  {
    key: "funded", name: "Funded", price: "$79", period: "/mo",
    brokers: 10, prop: true, priority: true,
    features: ["10 broker accounts", "Unlimited signals/day", "All Pro features", "Prop Mode engine", "Multi-region failover", "Priority human support"],
  },
  {
    key: "lifetime", name: "Lifetime", price: "$399", period: " once",
    brokers: 3, prop: true, priority: true,
    features: ["3 broker accounts", "Unlimited signals/day", "Pro-level features", "All future updates", "Pay once, own forever"],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function planIcon(plan: string) {
  switch (plan) {
    case "pro":      return <Zap size={14} />;
    case "funded":   return <Shield size={14} />;
    case "lifetime": return <Star size={14} />;
    default:         return <CreditCard size={14} />;
  }
}

function trialDaysLeft(trialEndsAt: string | null): number {
  if (!trialEndsAt) return 0;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
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

  const { data: subRow } = await db
    .from("subscriptions")
    .select("plan, status, current_period_end, trial_ends_at, cancelled_at, provider")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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

  // ── Invoice history ──────────────────────────────────────────────────────
  const { data: userRow } = await db
    .from("users")
    .select("stripe_customer_id, paystack_customer_code")
    .eq("id", user.id)
    .maybeSingle();

  const stripeCustomerId: string | null =
    (userRow as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;
  const paystackCustomerCode: string | null =
    (userRow as { paystack_customer_code?: string | null } | null)?.paystack_customer_code ?? null;

  const [stripeInvoices, paystackInvoices] = await Promise.all([
    stripeCustomerId   ? fetchStripeInvoices(stripeCustomerId)         : [],
    paystackCustomerCode ? fetchPaystackInvoices(paystackCustomerCode) : [],
  ]);

  const invoices: InvoiceRow[] = [...stripeInvoices, ...paystackInvoices].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Show Paystack NGN buttons only when at least one plan code is configured
  const paystackEnabled = !!(
    process.env.PAYSTACK_SECRET_KEY && (
      process.env.PAYSTACK_PLAN_STARTER_CODE ||
      process.env.PAYSTACK_PLAN_PRO_CODE ||
      process.env.PAYSTACK_PLAN_FUNDED_CODE ||
      process.env.PAYSTACK_LIFETIME_AMOUNT_KOBO
    )
  );

  const paystackPlanEnabled: Record<string, boolean> = {
    starter:  !!(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_PLAN_STARTER_CODE),
    pro:      !!(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_PLAN_PRO_CODE),
    funded:   !!(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_PLAN_FUNDED_CODE),
    lifetime: !!(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_LIFETIME_AMOUNT_KOBO),
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Billing</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Plans and payment · USD via Stripe · NGN via Paystack
        </p>
      </div>

      {/* Trial expiry banners */}
      {trialExpired && (
        <div className="card border-loss/30 bg-loss/5 px-4 py-3 flex items-start gap-2 text-sm text-loss">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>
            Your free trial has ended — signal execution is paused. Choose a plan below to continue.
          </span>
        </div>
      )}
      {trialExpiringSoon && (
        <div className="card border-warning/30 bg-warning/5 px-4 py-3 flex items-start gap-2 text-sm text-warning">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>
            Your trial ends in {daysLeft} day{daysLeft !== 1 ? "s" : ""}. Upgrade to keep signals running uninterrupted.
          </span>
        </div>
      )}

      {/* Success / cancelled flash */}
      {params.success && (
        <div className="card border-profit/30 bg-profit/5 px-4 py-3 flex items-center gap-2 text-sm text-profit">
          <CheckCircle2 size={15} />
          Payment confirmed — your plan is now active.
        </div>
      )}
      {params.cancelled && (
        <div className="card px-4 py-3 text-sm text-text-secondary">
          Checkout cancelled — no charge was made.
        </div>
      )}

      {/* Current plan banner */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-primary">
            {planIcon(currentPlan)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-text-primary capitalize">
                {currentPlan === "trial" ? "Free trial" : currentPlan}
              </p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  isActive ? "bg-profit/20 text-profit" : isPastDue ? "bg-warning/20 text-warning" : "bg-border text-text-muted"
                }`}
              >
                {isTrial ? `${daysLeft}d left` : currentStatus}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              {isTrial
                ? "No card required until trial ends."
                : sub?.current_period_end
                ? `Renews ${fmtDate(sub.current_period_end)}`
                : sub?.cancelled_at
                ? `Cancelled ${fmtDate(sub.cancelled_at)}`
                : ""}
            </p>
          </div>
        </div>

        {/* Manage subscription portal link — only for paid Stripe subs */}
        {hasStripe && !isTrial && <BillingActions action="portal" label="Manage subscription" />}
      </div>

      {/* Past-due warning */}
      {isPastDue && (
        <div className="card border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
          Payment failed — execution is paused. Update your payment method to resume.
        </div>
      )}

      {/* Plan cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.key && isActive;
          return (
            <div
              key={plan.key}
              className={`card p-4 space-y-4 relative flex flex-col ${
                plan.popular ? "border-primary/40" : ""
              } ${isCurrent ? "ring-1 ring-primary/40" : ""}`}
            >
              {plan.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-2xs font-semibold text-[#04201D] whitespace-nowrap">
                  Most popular
                </span>
              )}

              <div>
                <div className="flex items-center gap-1.5 text-text-secondary mb-1">
                  {planIcon(plan.key)}
                  <span className="text-xs font-medium">{plan.name}</span>
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="num text-2xl font-bold text-text-primary">{plan.price}</span>
                  <span className="text-xs text-text-muted">{plan.period}</span>
                </div>
              </div>

              <ul className="space-y-1.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-text-secondary">
                    <CheckCircle2 size={11} className="text-profit mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {/* Prop Mode availability indicator */}
              <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ${
                plan.key === "funded"
                  ? "bg-primary/10 text-primary"
                  : "bg-surface-elevated text-text-muted"
              }`}>
                <Shield size={11} className="shrink-0" />
                {plan.key === "funded"
                  ? "Prop Mode included"
                  : "Prop Mode — Funded only"}
              </div>

              <div className="space-y-2">
                <BillingActions
                  action="checkout"
                  plan={plan.key}
                  isCurrent={isCurrent}
                  label={isCurrent ? "Current plan" : `Get ${plan.name}`}
                />
                {paystackEnabled && paystackPlanEnabled[plan.key] && !isCurrent && (
                  <PaystackActions
                    plan={plan.key}
                    label={`Pay in Naira (₦)`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-text-muted text-center">
        Prices in USD via Stripe · NGN via Paystack · Stripe Tax applied at checkout where applicable.
      </p>

      <InvoiceHistory invoices={invoices} />
    </div>
  );
}
