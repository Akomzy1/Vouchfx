"use client";

import { useState, useMemo } from "react";
import {
  Rocket, Zap, Crown, Infinity as InfinityIcon, Star, Check, Minus,
  CreditCard, Banknote, Wallet, ReceiptText, Lock, ShieldCheck, Info,
  RefreshCw, Loader2,
} from "lucide-react";

// ── Plan metadata (matches design prototype) ──────────────────────────────────

export type PlanKey = "starter" | "pro" | "funded" | "lifetime";

interface Feature {
  t: string;
  k?: boolean;   // key feature — bold
  off?: boolean; // not included
}

interface PlanMeta {
  id: PlanKey;
  name: string;
  Icon: React.ElementType;
  popular?: boolean;
  monthly?: number;
  oneoff?: number;
  tagline: string;
  brokers: string;
  features: Feature[];
}

const PLANS: PlanMeta[] = [
  {
    id: "starter", name: "Starter", Icon: Rocket,
    monthly: 19,
    tagline: "Get one account copying cleanly.",
    brokers: "1 broker account",
    features: [
      { t: "1 broker account", k: true },
      { t: "Unlimited signals / day", k: true },
      { t: "AI signal parsing & execution" },
      { t: "Core risk rules + drawdown guard" },
      { t: "Email support" },
      { t: "Prop-firm safe mode", off: true },
    ],
  },
  {
    id: "pro", name: "Pro", Icon: Zap, popular: true,
    monthly: 39,
    tagline: "For serious copiers running prop challenges.",
    brokers: "3 broker accounts",
    features: [
      { t: "3 broker accounts", k: true },
      { t: "Unlimited signals / day", k: true },
      { t: "Prop-firm safe mode (FTMO, MFF…)", k: true },
      { t: "Priority signal parsing" },
      { t: "Core risk rules + drawdown guard" },
      { t: "Priority support" },
    ],
  },
  {
    id: "funded", name: "Funded", Icon: Crown,
    monthly: 79,
    tagline: "For funded traders running many accounts.",
    brokers: "10 broker accounts",
    features: [
      { t: "10 broker accounts", k: true },
      { t: "Unlimited signals / day", k: true },
      { t: "Everything in Pro", k: true },
      { t: "Priority + failover execution", k: true },
      { t: "Dedicated account manager" },
      { t: "Slippage & latency reports" },
    ],
  },
  {
    id: "lifetime", name: "Lifetime", Icon: InfinityIcon,
    oneoff: 399,
    tagline: "Pay once. Pro features, forever.",
    brokers: "3 broker accounts",
    features: [
      { t: "3 broker accounts", k: true },
      { t: "Unlimited signals / day", k: true },
      { t: "All Pro features included", k: true },
      { t: "One payment — no subscription", k: true },
      { t: "Free updates for life" },
      { t: "Priority support" },
    ],
  },
];

const fmtUSD = (n: number) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Plan card ─────────────────────────────────────────────────────────────────

function PlanCard({
  plan, selected, isCurrent, onSelect,
}: {
  plan: PlanMeta;
  selected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  const PIcon = plan.Icon;
  return (
    <button
      onClick={onSelect}
      className={`group relative flex h-full flex-col rounded-2xl border bg-surface p-5 text-left transition-colors ${
        selected
          ? "border-primary ring-1 ring-primary/40"
          : plan.popular
            ? "border-primary/40 hover:border-primary/60"
            : "border-border hover:border-text-muted"
      }`}
    >
      {plan.popular && (
        <span className="absolute -top-2.5 left-5 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-[#04201D]">
          <Star size={11} strokeWidth={2.5} /> Most popular
        </span>
      )}
      <div className="flex items-center justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${selected || plan.popular ? "border-primary/30 bg-primary/10 text-primary-light" : "border-border bg-surface-elevated text-text-secondary"}`}>
          <PIcon size={18} />
        </span>
        {selected ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/15 px-2 py-1 text-[10.5px] font-bold text-primary-light">
            <Check size={11} strokeWidth={2.6} /> Selected
          </span>
        ) : (
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-border group-hover:border-text-muted" />
        )}
      </div>

      <h3 className="mt-3.5 text-[16px] font-bold tracking-tight text-text-primary">
        {plan.name}
        {isCurrent && (
          <span className="ml-2 rounded-full border border-profit/30 bg-profit/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-profit">Current</span>
        )}
      </h3>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">{plan.tagline}</p>

      <div className="mt-4 flex items-end gap-1.5">
        <span className="num text-[30px] font-bold leading-none text-text-primary">
          ${plan.oneoff ?? plan.monthly}
        </span>
        <span className="mb-0.5 text-[12px] text-text-muted">{plan.oneoff ? "one-off" : "/mo"}</span>
      </div>
      <p className="mt-1 text-[11px] text-text-muted">
        {plan.oneoff ? "Single payment · lifetime access" : "billed monthly"}
      </p>

      <div className="mt-4 h-px w-full bg-border/60" />

      <ul className="mt-4 flex flex-1 flex-col gap-2.5">
        {plan.features.map((f, i) => (
          <li key={i} className={`flex items-start gap-2 text-[12.5px] leading-snug ${f.off ? "text-text-muted/60" : "text-text-secondary"}`}>
            {f.off ? (
              <Minus size={14} className="mt-px shrink-0 text-text-muted/50" />
            ) : (
              <Check size={14} strokeWidth={2.4} className={`mt-px shrink-0 ${f.k ? "text-primary-light" : "text-text-muted"}`} />
            )}
            <span className={f.k && !f.off ? "font-semibold text-text-primary" : ""}>{f.t}</span>
          </li>
        ))}
      </ul>

      <span className={`mt-5 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-colors ${
        selected
          ? "bg-primary text-[#04201D]"
          : "border border-border bg-surface-elevated text-text-primary group-hover:border-primary/40 group-hover:text-primary-light"
      }`}>
        {selected ? <><Check size={15} strokeWidth={2.5} /> Selected</> : `Choose ${plan.name}`}
      </span>
    </button>
  );
}

// ── Payment method card ───────────────────────────────────────────────────────

function PayMethodCard({
  on, onSelect, Icon: MIcon, title, sub, badge, foot, disabled,
}: {
  on: boolean;
  onSelect: () => void;
  Icon: React.ElementType;
  title: string;
  sub: string;
  badge: string;
  foot?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`flex w-full items-start gap-3.5 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        on ? "border-primary/50 bg-primary/[0.06]" : "border-border bg-bg/40 hover:border-text-muted"
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${on ? "border-primary/30 bg-primary/10 text-primary-light" : "border-border bg-surface-elevated text-text-secondary"}`}>
        <MIcon size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold text-text-primary">{title}</span>
          <span className="rounded border border-border bg-surface-elevated px-1.5 py-px text-[10px] font-medium text-text-muted">{badge}</span>
        </span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-text-muted">{sub}</span>
        {foot && <span className="mt-2 flex items-center gap-1.5 text-[11px] text-text-muted">{foot}</span>}
      </span>
      <span className={`mt-0.5 flex shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-primary" : "border-text-muted"}`} style={{ height: 18, width: 18 }}>
        {on && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PlanCheckout({
  currentPlan, isActive, paystackPlanEnabled, renewsAt,
}: {
  currentPlan: string;
  isActive: boolean;
  paystackPlanEnabled: Record<string, boolean>;
  renewsAt: string | null;
}) {
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("pro");
  const [method, setMethod] = useState<"stripe" | "paystack">("stripe");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo(() => PLANS.find((p) => p.id === selectedPlan)!, [selectedPlan]);
  const usd = plan.oneoff ?? plan.monthly ?? 0;
  const isCurrent = isActive && currentPlan === selectedPlan;
  const paystackOk = paystackPlanEnabled[selectedPlan] ?? false;
  const effectiveMethod = method === "paystack" && !paystackOk ? "stripe" : method;
  const isNaira = effectiveMethod === "paystack";

  const renewLabel = plan.oneoff
    ? "Never — lifetime"
    : renewsAt ??
      new Date(Date.now() + 30 * 86_400_000).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      });

  async function confirm() {
    if (isCurrent) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint = isNaira ? "/api/billing/paystack/checkout" : "/api/billing/checkout";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "Could not start checkout");
        setLoading(false);
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      {/* Plan selection */}
      <section id="plans" className="scroll-mt-20">
        <div className="mb-4">
          <h2 className="text-[16px] font-bold tracking-tight text-text-primary">Choose your plan</h2>
          <p className="mt-0.5 text-[12.5px] text-text-secondary">
            All paid plans include unlimited daily signals and AI parsing.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              selected={selectedPlan === p.id}
              isCurrent={isActive && currentPlan === p.id}
              onSelect={() => setSelectedPlan(p.id)}
            />
          ))}
        </div>
        <p className="num mt-3 flex items-center justify-center gap-1.5 text-[11px] text-text-muted">
          <Info size={12} /> Starter, Pro and Funded are billed monthly. Lifetime is a one-off payment.
        </p>
      </section>

      {/* Payment + checkout */}
      <section>
        <h2 className="mb-4 text-[16px] font-bold tracking-tight text-text-primary">Payment &amp; checkout</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
          {/* Payment methods */}
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border/60 px-5 py-4">
              <Wallet size={16} className="text-primary-light" />
              <h3 className="text-[14px] font-bold tracking-tight text-text-primary">Payment method</h3>
            </div>
            <div className="flex flex-col gap-3 p-5">
              <PayMethodCard
                on={effectiveMethod === "stripe"}
                onSelect={() => setMethod("stripe")}
                Icon={CreditCard}
                title="Pay with card (USD)"
                badge="Stripe"
                sub="Visa, Mastercard or Amex. Charged in US dollars."
                foot={<><Lock size={11} className="text-primary-light" /> PCI-compliant · 3-D Secure</>}
              />
              <PayMethodCard
                on={effectiveMethod === "paystack"}
                onSelect={() => setMethod("paystack")}
                Icon={Banknote}
                title="Pay in naira (₦)"
                badge="Paystack"
                disabled={!paystackOk}
                sub={
                  paystackOk
                    ? "Nigerian cards, bank transfer or USSD. Charged in NGN at today's rate."
                    : "Not available for this plan yet."
                }
                foot={paystackOk ? <><RefreshCw size={11} className="text-primary-light" /> Charged in NGN at checkout</> : undefined}
              />
              <div className="mt-1 flex items-start gap-2 rounded-xl border border-border bg-bg/40 px-3.5 py-3 text-[12px] leading-relaxed text-text-muted">
                <Info size={14} className="mt-px shrink-0 text-text-secondary" />
                Card details are tokenized by our processor — VouchFX never stores your card number.
              </div>
            </div>
          </div>

          {/* Order summary */}
          <div className="lg:sticky lg:top-20 lg:self-start">
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <div className="flex items-center gap-2 border-b border-border/60 px-5 py-4">
                <ReceiptText size={16} className="text-primary-light" />
                <h3 className="text-[14px] font-bold tracking-tight text-text-primary">Order summary</h3>
              </div>
              <div className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-text-primary">VouchFX {plan.name}</span>
                      {plan.popular && (
                        <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0 text-[10px] font-medium text-primary-light">Popular</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[12px] text-text-muted">{plan.brokers} · unlimited signals</p>
                  </div>
                  <div className="num shrink-0 text-right text-[15px] font-bold text-text-primary">${fmtUSD(usd)}</div>
                </div>

                <div className="mt-4 flex flex-col gap-2.5 border-t border-border/60 pt-4 text-[12.5px]">
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Billing cycle</span>
                    <span className="font-medium text-text-primary">{plan.oneoff ? "One-time payment" : "Monthly"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Renews</span>
                    <span className="font-medium text-text-primary">{renewLabel}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Payment</span>
                    <span className="font-medium text-text-primary">{isNaira ? "Paystack (NGN)" : "Stripe (USD)"}</span>
                  </div>
                </div>

                <div className="mt-4 flex items-end justify-between border-t border-border/60 pt-4">
                  <div>
                    <div className="text-[12px] text-text-secondary">Total due today</div>
                    <div className="text-[11px] text-text-muted">{plan.oneoff ? "billed once" : "billed monthly"}</div>
                  </div>
                  <div className="text-right">
                    <div className="num text-[24px] font-bold leading-none text-text-primary">${fmtUSD(usd)}</div>
                    {isNaira && <div className="num mt-1 text-[12px] font-semibold text-primary-light">NGN at today&rsquo;s rate</div>}
                  </div>
                </div>

                {error && <p className="mt-3 text-center text-xs text-loss">{error}</p>}

                <button
                  onClick={confirm}
                  disabled={loading || isCurrent}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-[14px] font-bold text-[#04201D] transition-colors hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} strokeWidth={2.5} />}
                  {isCurrent ? "Current plan" : "Confirm & subscribe"}
                </button>
                <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] text-text-muted">
                  <ShieldCheck size={12} className="text-primary-light" />
                  Secured by {isNaira ? "Paystack" : "Stripe"} · cancel anytime
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
