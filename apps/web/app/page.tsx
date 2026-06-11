import type { Metadata } from "next";
import Link from "next/link";
import {
  ScanText,
  Zap,
  ScrollText,
  ShieldCheck,
  Shield,
  CreditCard,
  Send,
  SlidersHorizontal,
  Check,
  ArrowRight,
  Info,
  PlayCircle,
  Radar,
  Eye,
  UserCheck,
  History,
  Gift,
  Radio,
  Percent,
  CandlestickChart,
  Sparkles,
  Timer,
  CloudOff,
  Link as LinkIcon,
} from "lucide-react";
import Nav from "@/components/marketing/Nav";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "VouchFX — Telegram Signal Copier for MT5",
  description:
    "Copy signals from any Telegram channel to your MetaTrader 5 account automatically. AI-powered parsing, risk-controlled execution for live and funded traders.",
  keywords: [
    "telegram signal copier",
    "telegram to mt5",
    "signal copier mt5",
    "automated signal execution",
    "prop trading signals",
    "metatrader telegram signals",
  ],
  openGraph: {
    title: "VouchFX — Telegram Signal Copier for MT5",
    description:
      "Any signal, any format, executed under your own risk rules. Live and funded accounts.",
    type: "website",
  },
};

const FEATURES = [
  {
    Icon: ScanText,
    title: "AI parsing — text + screenshots",
    body: "Claude reads any format or language into a clean trade. Paste text or drop a screenshot — entry ranges, multiple TPs, pip-based stops, all handled.",
  },
  {
    Icon: Zap,
    title: "Fully-managed execution",
    body: "No MetaApi account, no VPS, no downloads — we run a co-located terminal so orders land in under a second. And it's the whole lifecycle: when a channel edits an SL/TP, partials out, or cancels, your live order is updated or closed to match automatically.",
  },
  {
    Icon: ScrollText,
    title: "Transparent audit log",
    body: "Every signal, end to end: the raw message, the parse, the plain-English reasoning, the risk checks, and the broker fill.",
  },
  {
    Icon: ShieldCheck,
    title: "Risk controls you set",
    body: "Per-trade risk, a daily signal limit, and a daily loss cap with a drawdown guardian. Hard stops, enforced automatically.",
  },
  {
    Icon: Shield,
    title: "Funded-trader friendly",
    body: "Daily-loss, drawdown and consistency guardrails keep funded and challenge accounts inside the rules — protection you control, enforced automatically.",
  },
  {
    Icon: CreditCard,
    title: "Naira & card checkout",
    body: "Pay in USD by card or in naira, other payment channels coming soon. Same plans, local pricing — no promo-code games.",
  },
];

const HOW_IT_WORKS = [
  {
    Icon: Send,
    step: "01",
    title: "Connect Telegram",
    body: "Securely link your account, read-only. We list the channels you already follow — we never post or message.",
  },
  {
    Icon: LinkIcon,
    step: "02",
    title: "Connect your broker",
    body: "Enter your MT5 login. We validate it live and run the terminal for you — no VPS, no MetaApi account.",
  },
  {
    Icon: SlidersHorizontal,
    step: "03",
    title: "Set your risk",
    body: "Risk per trade, daily signal limit, daily loss cap, default-SL policy. You stay fully in control.",
  },
];

interface PlanDef {
  name: string;
  price: number;
  cadence: string;
  popular: boolean;
  tagline: string;
  features: string[];
}

const PLANS: PlanDef[] = [
  {
    name: "Starter",
    price: 19,
    cadence: "/mo",
    popular: false,
    tagline: "For one account, one place.",
    features: [
      "1 broker account",
      "Unlimited signals/day",
      "Text + screenshot parsing",
      "Full audit log",
      "Naira checkout",
    ],
  },
  {
    name: "Pro",
    price: 39,
    cadence: "/mo",
    popular: true,
    tagline: "For multi-channel traders.",
    features: [
      "3 broker accounts",
      "Everything in Starter",
      "Prop-firm features",
      "Drawdown guardian + stealth",
      "Priority execution region",
    ],
  },
  {
    name: "Funded",
    price: 79,
    cadence: "/mo",
    popular: false,
    tagline: "For serious prop-firm traders.",
    features: [
      "10 broker accounts",
      "Everything in Pro",
      "Multi-region failover",
      "Priority human support",
    ],
  },
  {
    name: "Lifetime",
    price: 399,
    cadence: " one-off",
    popular: false,
    tagline: "Pay once, keep forever.",
    features: [
      "3 broker accounts",
      "All Pro features",
      "Lifetime updates",
      "No recurring fees",
    ],
  },
];

const BROKERS = [
  "Exness", "HFM", "FXTM", "Deriv",
  "IC Markets", "Pepperstone", "Octa", "XM",
];
const PROP_FIRMS = [
  "FTMO", "FundedNext", "The 5%ers", "E8 Markets",
  "Alpha Capital", "MyFundedFX", "The Funded Trader",
];

export default function LandingPage() {
  return (
    <>
      <Nav />

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-start justify-center pt-20"
          >
            <div className="h-[480px] w-[900px] rounded-full bg-primary/5 blur-3xl" />
          </div>

          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-2 lg:gap-8 lg:pb-24 lg:pt-20">
            {/* Copy */}
            <div>
              <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Zap size={12} /> Telegram → MT5 in under a second
              </div>
              <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-text-primary sm:text-5xl lg:text-[3.25rem]">
                Your Telegram signals,{" "}
                <span className="text-primary">traded automatically</span> on
                MT5.
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-text-secondary sm:text-base">
                Any signal, any format, executed under your own risk rules.
                Whether you trade a live account or a funded one, VouchFX keeps
                every trade inside your limits.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/auth/signup"
                  className="btn-primary inline-flex gap-2 px-6 py-3 text-base"
                >
                  Start 7-day free trial
                  <ArrowRight size={18} />
                </Link>
                <a
                  href="#how"
                  className="btn-ghost inline-flex gap-2 px-6 py-3 text-base"
                >
                  <PlayCircle size={18} /> See how it works
                </a>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-muted">
                <span className="flex items-center gap-1.5">
                  <Check size={13} className="text-primary" /> No card required
                </span>
                <span className="flex items-center gap-1.5">
                  <Check size={13} className="text-primary" /> Read-only Telegram
                </span>
                <span className="flex items-center gap-1.5">
                  <Check size={13} className="text-primary" /> Cancel anytime
                </span>
              </div>
            </div>

            {/* Signal → trade visual */}
            <div className="flex flex-col gap-3 items-center lg:items-stretch">
              {/* Incoming signal card */}
              <div className="card p-4 space-y-0 w-full max-w-sm mx-auto lg:mx-0">
                <div className="flex items-center gap-3 border-b border-border/70 pb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated text-primary">
                    <Send size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text-primary">Gold Sniper VIP</div>
                    <div className="text-xs text-text-muted">Telegram channel · 12,400 members</div>
                  </div>
                  <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Live
                  </span>
                </div>
                <div className="mt-3.5 rounded-xl bg-surface-elevated p-3.5">
                  <pre className="font-mono text-[13.5px] leading-relaxed text-text-primary whitespace-pre-line">{`🟢 GOLD BUY NOW 3000–3010
SL 2980
TP1 3030 · TP2 3050 · TP3 3080`}</pre>
                  <div className="mt-2 text-right font-mono text-[11px] text-text-muted">09:42</div>
                </div>
              </div>

              {/* Processing indicator */}
              <div className="flex items-center justify-center gap-2 self-center rounded-full border border-primary/25 bg-surface px-4 py-1.5 text-xs text-text-secondary">
                <Sparkles size={12} className="text-primary" />
                <span>Parsed · <span className="font-mono">0.97</span></span>
                <ArrowRight size={12} className="text-primary" />
              </div>

              {/* Trade confirmation card */}
              <div className="card-elevated w-full max-w-sm mx-auto lg:mx-0 border-primary/15 p-4 space-y-0">
                <div className="flex items-center justify-between border-b border-border/70 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-elevated text-primary">
                      <CandlestickChart size={17} />
                    </div>
                    <div>
                      <div className="num text-[15px] font-semibold tracking-wide text-text-primary">XAUUSD</div>
                      <div className="text-[11px] text-text-muted">Exness · Order #80451123</div>
                    </div>
                  </div>
                  <span className="rounded-md bg-primary/15 px-2.5 py-1 text-xs font-bold tracking-wide text-primary">BUY</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-xs text-text-secondary">Volume</span>
                  <span className="num text-sm font-semibold text-text-primary">0.12 lots</span>
                </div>
                <div className="space-y-1.5 text-xs font-mono text-text-secondary">
                  <div className="flex justify-between"><span>Entry</span><span>3001.20</span></div>
                  <div className="flex justify-between"><span>Stop loss</span><span>2980.00</span></div>
                  <div className="flex justify-between"><span>Take profit</span><span className="text-primary">3030 / 3050 / 3080</span></div>
                </div>
                <div className="mt-3 flex items-center gap-1.5 border-t border-border/70 pt-3 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-profit" />
                  <span className="text-profit font-medium">Filled · live P&amp;L</span>
                  <span className="ml-auto font-mono text-text-muted">+0.9s</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Trust strip ───────────────────────────────────────────────── */}
        <section className="border-y border-border bg-surface/40">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-9">
            <p className="text-center text-xs font-medium uppercase tracking-[0.18em] text-text-muted mb-5">
              Works with any MT5 broker — funded-account friendly
            </p>

            {/* Broker name marquee */}
            <div className="overflow-hidden">
              <div className="flex gap-3 animate-marquee whitespace-nowrap">
                {[...BROKERS, ...BROKERS].map((name, i) => (
                  <span
                    key={i}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-medium text-text-secondary"
                  >
                    {name}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex gap-3 animate-marquee-rev whitespace-nowrap">
                {[...PROP_FIRMS, ...PROP_FIRMS].map((name, i) => (
                  <span
                    key={i}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-medium text-text-secondary"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>

            {/* Stats row */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 border-t border-border/60 pt-6">
              {(
                [
                  [Timer, "<1s execution"],
                  [ScanText, "Any signal format"],
                  [CloudOff, "No VPS, no downloads"],
                ] as [React.ElementType, string][]
              ).map(([I, label]) => (
                <span key={label} className="flex items-center gap-2 text-[13px] font-medium text-text-secondary">
                  <I size={15} className="text-primary" /> {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <section id="how" className="scroll-mt-20 mx-auto max-w-6xl px-4 sm:px-6 py-20 lg:py-24">
          <div className="text-center space-y-3 mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              How it works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary">
              Live in 90 seconds of setup
            </h2>
            <p className="text-text-secondary max-w-xl mx-auto text-[15px] leading-relaxed">
              Three steps. Then VouchFX watches your channels and executes the moment a signal lands.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {HOW_IT_WORKS.map(({ Icon, step, title, body }) => (
              <div key={title} className="relative rounded-2xl border border-border bg-surface p-6">
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                    <Icon size={20} />
                  </div>
                  <span className="num text-2xl font-bold text-text-muted/40">{step}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-text-primary">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Feature grid ──────────────────────────────────────────────── */}
        <section id="features" className="border-t border-border bg-surface/30 scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 lg:py-24">
            <div className="space-y-3 mb-12">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Features
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-text-primary">
                Built to be reliable, fast, and transparent
              </h2>
              <p className="text-text-secondary max-w-2xl text-[15px] leading-relaxed">
                The fundamentals done properly — so you never miss a signal and always know exactly what happened.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map(({ Icon, title, body }) => (
                <div
                  key={title}
                  className="group rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary/40"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-elevated text-primary transition-colors group-hover:border-primary/30">
                    <Icon size={20} />
                  </div>
                  <h3 className="mt-5 text-[17px] font-semibold text-text-primary">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Rule Monitor band ─────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-20 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Radar size={13} /> AI rule monitoring
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-text-primary sm:text-[2.2rem]">
                Prop firm changed the rules?{" "}
                <span className="text-primary">We already know.</span>
              </h2>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-text-secondary">
                Our AI agent monitors your prop firm around the clock — drawdown limits, daily loss,
                consistency rules, news windows. When a firm updates its terms, the change is detected,
                human-verified, and live in your guardrails before it can catch you out. Every ruleset
                shows when it was last verified, so you&apos;re never trading on stale rules.
              </p>
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2.5">
                {(
                  [
                    [Eye, "24/7 monitoring"],
                    [UserCheck, "Human-verified"],
                    [History, "Last-verified timestamps"],
                  ] as [React.ElementType, string][]
                ).map(([I, label]) => (
                  <span key={label} className="flex items-center gap-2 text-[13px] font-medium text-text-secondary">
                    <I size={15} className="text-primary" /> {label}
                  </span>
                ))}
              </div>
              <p className="mt-5 text-xs text-text-muted">Available on the Funded plan.</p>
            </div>

            {/* Rule change card */}
            <div className="flex justify-center lg:justify-end">
              <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4 shadow-[0_8px_40px_-8px_rgba(20,184,166,0.12)]">
                <div className="flex items-center justify-between border-b border-border/70 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                      <Radar size={17} />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-text-primary">Rule change detected</div>
                      <div className="text-[11px] text-text-muted">Prop-firm monitor</div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />Live
                  </span>
                </div>
                <div className="mt-3.5 rounded-xl border border-border bg-surface-elevated p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-text-primary">FundingPips</span>
                    <span className="text-[11px] font-medium text-primary">Updated</span>
                  </div>
                  <div className="space-y-1.5 text-[12px]">
                    <div className="flex items-center justify-between text-text-secondary">
                      <span>Daily loss limit</span>
                      <span className="flex items-center gap-2">
                        <span className="num text-text-muted line-through">5%</span>
                        <ArrowRight size={11} className="text-text-muted" />
                        <span className="num text-primary font-semibold">4%</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-text-secondary">
                      <span>Consistency rule</span>
                      <span className="flex items-center gap-2">
                        <span className="text-text-muted">Off</span>
                        <ArrowRight size={11} className="text-text-muted" />
                        <span className="text-primary font-semibold">30%</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 border-t border-border/60 pt-2.5 text-[11px] text-text-muted">
                    <Check size={11} className="text-profit shrink-0" />
                    Human-verified · Guardrails updated
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pricing ───────────────────────────────────────────────────── */}
        <section id="pricing" className="border-t border-border scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 lg:py-24">
            <div className="text-center space-y-3 mb-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Pricing
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-text-primary">
                Clear, predictable pricing
              </h2>
              <p className="text-text-secondary text-[15px]">
                Start free for 7 days — no card. Then pick the plan that fits how you trade.
              </p>
            </div>

            <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs text-text-secondary mb-10">
              <Info size={13} className="text-primary" />
              1 signal/day on trial — unlimited on any paid plan.
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {PLANS.map(({ name, price, cadence, popular, tagline, features }) => (
                <div
                  key={name}
                  className={`relative flex flex-col rounded-2xl border p-6 ${
                    popular
                      ? "border-primary/60 bg-surface-elevated ring-1 ring-primary/30"
                      : "border-border bg-surface"
                  }`}
                >
                  {popular && (
                    <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#04201D]">
                      Most popular
                    </span>
                  )}

                  <div className="text-sm font-semibold text-text-primary">{name}</div>
                  <div className="mt-1 text-xs text-text-muted">{tagline}</div>
                  <div className="mt-4 flex items-baseline gap-0.5">
                    <span className="num text-3xl font-bold tracking-tight text-text-primary">${price}</span>
                    <span className="text-sm text-text-secondary">{cadence}</span>
                  </div>

                  <ul className="mt-5 flex-1 space-y-2.5">
                    {features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-[13px] text-text-secondary">
                        <Check
                          size={15}
                          className={`mt-0.5 shrink-0 ${popular ? "text-primary" : "text-primary"}`}
                        />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/auth/signup"
                    className={`mt-6 w-full justify-center text-sm ${
                      popular ? "btn-primary" : "btn-ghost"
                    }`}
                  >
                    Get started
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA band ──────────────────────────────────────────────────── */}
        <section className="border-t border-border bg-surface/40">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
            <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-8 text-center sm:p-12">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <div className="h-[300px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
              </div>
              <div className="relative">
                <h2 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
                  Never miss a signal again.
                </h2>
                <p className="mx-auto mt-3 max-w-lg text-[15px] text-text-secondary">
                  Connect your channels and your broker, set your risk, and let VouchFX execute — while you keep full control.
                </p>
                <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link href="/auth/signup" className="btn-primary inline-flex gap-2 px-6 py-3 text-base">
                    Start 7-day free trial <ArrowRight size={18} />
                  </Link>
                  <a href="#how" className="btn-ghost inline-flex gap-2 px-6 py-3 text-base">
                    See how it works
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Affiliate / referral band ─────────────────────────────────── */}
        <section id="affiliates" className="scroll-mt-20 border-t border-border bg-bg">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 lg:py-24">
            <div className="flex flex-col items-center text-center mb-12">
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Percent size={13} /> Earn 20%
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-text-primary sm:text-[2.2rem]">
                Share VouchFX, earn 20%
              </h2>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-text-secondary">
                Whether you trade or run a channel, get paid every month for the people you bring on.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {[
                {
                  Icon: Gift,
                  tag: "For traders",
                  title: "Refer a friend",
                  body: "They get 20% off their first month. You get 20% recurring as account credit — for as long as they stay subscribed.",
                  cta: "Invite a friend",
                },
                {
                  Icon: Radio,
                  tag: "For channel owners",
                  title: "Run a signal channel?",
                  body: "Turn your audience into recurring income. Earn 20% recurring commission for every trader you refer, paid out every month.",
                  cta: "Become an affiliate",
                },
              ].map(({ Icon, tag, title, body, cta }) => (
                <div
                  key={title}
                  className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface p-7 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                      <Icon size={20} />
                    </div>
                    <span className="text-xs font-medium uppercase tracking-wider text-text-muted">{tag}</span>
                  </div>
                  <div className="mt-5 flex items-baseline gap-2">
                    <span className="num text-4xl font-bold tracking-tight text-primary">20%</span>
                    <span className="text-sm text-text-secondary">recurring</span>
                  </div>
                  <h3 className="mt-3 text-xl font-semibold text-text-primary">{title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-text-secondary">{body}</p>
                  <Link
                    href="/auth/signup?affiliate=1"
                    className="group mt-6 inline-flex items-center gap-2 self-start rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-[#04201D] transition-all hover:opacity-90 active:translate-y-px"
                  >
                    {cta} <ArrowRight size={16} />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Community strip ───────────────────────────────────────────── */}
        <section className="border-t border-border bg-bg">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-7">
            <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-border bg-surface/60 px-6 py-5 text-center sm:flex-row sm:text-left">
              <p className="flex items-center gap-2.5 text-[15px] text-text-secondary">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated text-primary">
                  <Send size={15} />
                </span>
                Questions? Join the VouchFX community on Telegram.
              </p>
              <a
                href="https://t.me/getvouchfx"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-surface/60 px-5 py-2.5 text-sm font-semibold text-text-primary transition-all hover:border-text-muted hover:bg-surface-elevated"
              >
                <Send size={16} /> Open Telegram
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-bg">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                <span className="text-[17px] font-bold tracking-tight text-text-primary">
                  Vouch<span className="text-primary">FX</span>
                </span>
              </div>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-text-secondary">
                The cleanest, fastest, most transparent Telegram-to-MT5 copier. Signals you choose, executed on rules you set.
              </p>
              <a
                href="https://t.me/getvouchfx"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-text-primary transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Send size={15} /> Join our Telegram
              </a>
            </div>

            {/* Product */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">Product</div>
              <ul className="mt-4 space-y-2.5">
                {[
                  ["Features", "#features"],
                  ["How it works", "#how"],
                  ["Pricing", "#pricing"],
                  ["Affiliates", "#affiliates"],
                ].map(([label, href]) => (
                  <li key={label}>
                    <a href={href} className="text-sm text-text-secondary transition-colors hover:text-text-primary">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">Company</div>
              <ul className="mt-4 space-y-2.5">
                {[["About", "#"], ["Support", "#"], ["Status", "#"]].map(([label, href]) => (
                  <li key={label}>
                    <a href={href} className="text-sm text-text-secondary transition-colors hover:text-text-primary">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">Legal</div>
              <ul className="mt-4 space-y-2.5">
                {[["Terms", "#"], ["Privacy", "#"], ["Risk disclosure", "#"]].map(([label, href]) => (
                  <li key={label}>
                    <a href={href} className="text-sm text-text-secondary transition-colors hover:text-text-primary">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="mt-12 rounded-xl border border-border bg-surface/50 p-4">
            <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-text-muted">
              <Info size={15} className="mt-0.5 shrink-0 text-text-muted" />
              VouchFX is an execution tool you control. It does not provide financial advice or guarantee outcomes. Trading involves risk.
            </p>
          </div>

          {/* Bottom bar */}
          <div className="mt-6 flex flex-col items-center justify-between gap-3 text-xs text-text-muted sm:flex-row">
            <span>© 2026 VouchFX. All rights reserved.</span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-profit" />
              All systems operational
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
