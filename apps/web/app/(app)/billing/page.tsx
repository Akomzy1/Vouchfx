import { CreditCard } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Billing" };

const PLANS = [
  {
    name: "Starter",
    price: "$19/mo",
    brokers: 1,
    signals: "Unlimited",
    notes: "Text + vision parsing, audit log",
  },
  {
    name: "Pro",
    price: "$39/mo",
    brokers: 3,
    signals: "Unlimited",
    notes: "Prop-firm features, priority region",
    popular: true,
  },
  {
    name: "Funded",
    price: "$79/mo",
    brokers: 10,
    signals: "Unlimited",
    notes: "Multi-region failover, priority support",
  },
  {
    name: "Lifetime",
    price: "$399",
    brokers: 3,
    signals: "Unlimited",
    notes: "Pro features, lifetime updates",
  },
];

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Billing</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Plans and payment. USD via Stripe · NGN via Paystack.
        </p>
      </div>

      {/* Trial banner */}
      <div className="card border-primary/30 p-4 flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <CreditCard size={16} className="text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-text-primary">Free trial — 7 days remaining</p>
          <p className="text-xs text-text-secondary mt-0.5">
            All features active. No card required until you choose a plan.
          </p>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`card p-4 space-y-3 relative ${
              plan.popular ? "border-primary/40" : ""
            }`}
          >
            {plan.popular && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-2xs font-semibold text-[#04201D] whitespace-nowrap">
                Most popular
              </span>
            )}
            <div>
              <p className="font-semibold text-text-primary">{plan.name}</p>
              <p className="num text-2xl font-bold text-text-primary mt-0.5">{plan.price}</p>
            </div>
            <ul className="space-y-1 text-xs text-text-secondary">
              <li>{plan.brokers} broker account{plan.brokers > 1 ? "s" : ""}</li>
              <li>{plan.signals} signals/day</li>
              <li>{plan.notes}</li>
            </ul>
            <button
              disabled
              className="btn-ghost w-full text-xs opacity-50 cursor-not-allowed"
            >
              Coming in P1.21
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-text-muted text-center">
        Billing integration (Stripe + Paystack) coming in P1.21–P1.22.
      </p>
    </div>
  );
}
