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
  CheckCircle2,
  ArrowRight,
  ArrowDown,
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
  Wallet,
  Link as LinkIcon,
} from "lucide-react";
import Nav from "@/components/marketing/Nav";
import Mark from "@/components/marketing/Mark";

export const revalidate = 3600;

const TELEGRAM_URL = "https://t.me/getvouchfx";

export const metadata: Metadata = {
  title: "VouchFX — Your Telegram signals, traded automatically on MT5",
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

/* ── Shared button styles (match prototype PrimaryBtn / GhostBtn) ── */
const PRIMARY_BTN =
  "group inline-flex items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-[#04201D] shadow-[0_8px_24px_-8px_rgba(20,184,166,0.6)] transition-all hover:bg-primary-light hover:shadow-[0_10px_30px_-8px_rgba(20,184,166,0.7)] active:translate-y-px";
const GHOST_BTN =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface/60 font-semibold text-text-primary transition-all hover:border-text-muted hover:bg-surface-elevated";
const BTN_LG = "px-6 py-3.5 text-[15px]";
const BTN_MD = "px-5 py-2.5 text-sm";

/* ── Hero: signal → trade visual ── */

function SignalBubble() {
  return (
    <div className="anim-float w-full max-w-sm rounded-2xl border border-border bg-surface p-4" style={{ animationDelay: "0.05s" }}>
      <div className="flex items-center gap-3 border-b border-border/70 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated text-primary-light">
          <Send size={16} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">Gold Sniper VIP</div>
          <div className="text-xs text-text-muted">Telegram channel · 12,400 members</div>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary-light">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-primary" />
          Live
        </span>
      </div>
      <div className="mt-3.5 rounded-xl rounded-tl-sm bg-surface-elevated p-3.5 text-[13.5px] leading-relaxed">
        <div className="num whitespace-pre-line text-text-primary">
          {`🟢 GOLD BUY NOW 3000-3010
SL 2980
TP1 3030
TP2 3050
TP3 3080`}
        </div>
        <div className="num mt-2 text-right text-[11px] text-text-muted">09:42</div>
      </div>
    </div>
  );
}

function ParseArrow() {
  return (
    <div className="flex shrink-0 flex-col items-center gap-2 py-1 md:py-0">
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary-light">
        <Sparkles size={13} /> Parsed · <span className="num">0.97</span>
      </span>
      <div className="text-text-muted">
        <ArrowDown size={26} className="md:hidden" />
        <ArrowRight size={26} className="hidden md:block" />
      </div>
    </div>
  );
}

function TradeTicket() {
  const rows: [string, string][] = [
    ["Entry", "3001.20"],
    ["Stop loss", "2980.00"],
    ["Take profit", "3030 / 3050 / 3080"],
  ];
  return (
    <div className="anim-float ticket-shadow w-full max-w-sm rounded-2xl border border-border bg-surface p-4" style={{ animationDelay: "0.35s" }}>
      <div className="flex items-center justify-between border-b border-border/70 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-elevated text-primary-light">
            <CandlestickChart size={17} />
          </div>
          <div>
            <div className="num text-[15px] font-semibold tracking-wide text-text-primary">XAUUSD</div>
            <div className="text-[11px] text-text-muted">Exness · Order #80451123</div>
          </div>
        </div>
        <span className="rounded-md bg-primary/15 px-2.5 py-1 text-xs font-bold tracking-wide text-primary-light">BUY</span>
      </div>
      <div className="flex items-center justify-between py-3">
        <span className="text-xs text-text-secondary">Volume</span>
        <span className="num text-sm font-semibold text-text-primary">0.12 lots</span>
      </div>
      <div className="space-y-2 border-t border-border/60 pt-3">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">{k}</span>
            <span className="num text-[13px] text-text-primary">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-3.5 flex items-center justify-between rounded-xl border border-profit/25 bg-profit/[0.07] px-3.5 py-3">
        <div className="flex items-center gap-2 text-xs font-medium text-text-secondary">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-profit" /> Filled · live P&amp;L
        </div>
        <span className="num text-base font-bold text-profit">+$84.20</span>
      </div>
    </div>
  );
}

/* ── Trust strip: real broker & prop-firm logos on white chips ── */

function LogoPill({ name, file }: { name: string; file: string }) {
  return (
    <span className="mx-2 inline-flex h-[58px] items-center justify-center rounded-xl border border-border bg-white px-6 transition-transform hover:-translate-y-0.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/logos/${file}.png`} alt={name} className="h-8 w-auto object-contain" draggable={false} />
    </span>
  );
}

function Marquee({ items, reverse }: { items: [string, string][]; reverse?: boolean }) {
  const loop = [...items, ...items];
  return (
    <div className="marquee-row marquee-mask overflow-hidden py-1.5">
      <div className={`marquee-track ${reverse ? "rev" : ""}`}>
        {loop.map(([name, file], i) => (
          <LogoPill key={i} name={name} file={file} />
        ))}
      </div>
    </div>
  );
}

const BROKERS: [string, string][] = [
  ["Exness", "exness"], ["HFM", "hfm"], ["FXTM", "fxtm"], ["Deriv", "deriv"],
  ["IC Markets", "icmarkets"], ["Pepperstone", "pepperstone"], ["Octa", "octa"], ["XM", "xm"],
];
const PROP_FIRMS: [string, string][] = [
  ["FTMO", "ftmo"], ["FundedNext", "fundednext"], ["The 5%ers", "the5ers"], ["E8 Markets", "e8"],
  ["Alpha Capital", "alphacapital"], ["MyFundedFX", "myfundedfx"], ["The Funded Trader", "thefundedtrader"],
];

/* ── Section header ── */

function SectionHeader({ eyebrow, title, sub, center }: { eyebrow?: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={`max-w-2xl ${center ? "mx-auto text-center" : ""}`}>
      {eyebrow && <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</div>}
      <h2 className="text-balance text-3xl font-bold tracking-tight text-text-primary sm:text-[2.2rem]">{title}</h2>
      {sub && <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">{sub}</p>}
    </div>
  );
}

/* ── Page ── */

const HOW_IT_WORKS = [
  { Icon: Send, title: "Connect Telegram", body: "Securely link your account, read-only. We list the channels you already follow — we never post or message." },
  { Icon: LinkIcon, title: "Connect your broker", body: "Enter your MT5 login. We validate it live and run the terminal for you — no VPS, no MetaApi account." },
  { Icon: SlidersHorizontal, title: "Set your risk", body: "Risk per trade, daily signal limit, daily loss cap, default-SL policy. You stay fully in control." },
];

const FEATURES = [
  { Icon: ScanText, title: "AI parsing — text + screenshots", body: "Claude reads any format or language into a clean trade. Paste text or drop a screenshot — entry ranges, multiple TPs, pip-based stops, all handled." },
  { Icon: Zap, title: "Fully-managed execution", body: "No MetaApi account, no VPS, no downloads — we run a co-located terminal so orders land in under a second. And it is the whole lifecycle: when a channel edits an SL/TP, partials out, or cancels, your live order is updated or closed to match automatically." },
  { Icon: ScrollText, title: "Transparent audit log", body: "Every signal, end to end: the raw message, the parse, the plain-English reasoning, the risk checks, and the broker fill." },
  { Icon: ShieldCheck, title: "Risk controls you set", body: "Per-trade risk, a daily signal limit, and a daily loss cap with a drawdown guardian. Hard stops, enforced automatically." },
  { Icon: Shield, title: "Funded-trader friendly", body: "Daily-loss, drawdown and consistency guardrails keep funded and challenge accounts inside the rules — protection you control, enforced automatically." },
  { Icon: CreditCard, title: "Payment", body: "Pay in USD by card or in naira, other payment channels coming soon. Same plans, local pricing — no promo-code games." },
];

const PLANS = [
  {
    name: "Starter", price: "$19", cadence: "/mo", popular: false,
    tagline: "For one account, one place.",
    features: ["1 broker account", "Unlimited signals/day", "Text + screenshot parsing", "Full audit log", "Naira checkout"],
  },
  {
    name: "Pro", price: "$39", cadence: "/mo", popular: true,
    tagline: "For multi-channel traders.",
    features: ["3 broker accounts", "Everything in Starter", "Prop-firm features", "Drawdown guardian + stealth", "Priority execution region"],
  },
  {
    name: "Funded", price: "$79", cadence: "/mo", popular: false,
    tagline: "For serious prop-firm traders.",
    features: ["10 broker accounts", "Everything in Pro", "Multi-region failover", "Priority human support"],
  },
  {
    name: "Lifetime", price: "$399", cadence: " one-off", popular: false,
    tagline: "Pay once, keep forever.",
    features: ["3 broker accounts", "All Pro features", "Lifetime updates", "No recurring fees"],
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg font-sans">
      <Nav />

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="grid-glow relative overflow-hidden">
          <div className="dot-grid absolute inset-0 opacity-60" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-14 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pb-24 lg:pt-20">
            <div>
              <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary-light">
                <Zap size={13} /> Telegram → MT5 in under a second
              </span>
              <h1 className="text-balance text-4xl font-extrabold leading-[1.05] tracking-tight text-text-primary sm:text-5xl lg:text-[3.4rem]">
                Your Telegram signals,<br />
                <span className="text-primary-light">traded automatically on MT5.</span>
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-text-secondary sm:text-base">
                Any signal, any format, executed under your own risk rules. Whether you trade a
                live account or a funded one, VouchFX keeps every trade inside your limits.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className={`${PRIMARY_BTN} ${BTN_LG}`}>
                  Start 7-day free trial
                  <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a href="#how" className={`${GHOST_BTN} ${BTN_LG}`}>
                  <PlayCircle size={18} /> See how it works
                </a>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-muted">
                <span className="flex items-center gap-1.5"><Check size={14} className="text-primary" /> No card required</span>
                <span className="flex items-center gap-1.5"><Check size={14} className="text-primary" /> Read-only Telegram</span>
                <span className="flex items-center gap-1.5"><Check size={14} className="text-primary" /> Cancel anytime</span>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 lg:flex-row lg:items-stretch lg:justify-end">
              <SignalBubble />
              <div className="flex items-center justify-center self-center">
                <ParseArrow />
              </div>
              <TradeTicket />
            </div>
          </div>
        </section>

        {/* ── Trust strip ───────────────────────────────────────────────── */}
        <section className="border-y border-border bg-surface/40">
          <div className="mx-auto max-w-7xl px-5 py-9 sm:px-8">
            <div className="flex flex-col gap-1.5 text-center">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
                Works with any MT5 broker — funded-account friendly
              </span>
            </div>
            <div className="mt-5 space-y-2">
              <Marquee items={BROKERS} />
              <Marquee items={PROP_FIRMS} reverse />
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 border-t border-border/60 pt-6">
              {([
                [Timer, "<1s execution"],
                [ScanText, "Any signal format"],
                [CloudOff, "No VPS, no downloads"],
              ] as [React.ElementType, string][]).map(([I, label]) => (
                <span key={label} className="flex items-center gap-2 text-[13px] font-medium text-text-secondary">
                  <I size={15} className="text-primary" /> {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <section id="how" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-8 lg:py-24">
          <SectionHeader
            eyebrow="How it works"
            title="Live in 90 seconds of setup"
            sub="Three steps. Then VouchFX watches your channels and executes the moment a signal lands."
            center
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {HOW_IT_WORKS.map(({ Icon, title, body }, i) => (
              <div key={title} className="relative rounded-2xl border border-border bg-surface p-6">
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary-light">
                    <Icon size={20} />
                  </div>
                  <span className="num text-2xl font-bold text-text-muted/50">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-text-primary">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Feature grid ──────────────────────────────────────────────── */}
        <section id="features" className="scroll-mt-20 border-t border-border bg-surface/30">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-24">
            <SectionHeader
              eyebrow="Features"
              title="Built to be reliable, fast, and transparent"
              sub="The fundamentals done properly — so you never miss a signal and always know exactly what happened."
            />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ Icon, title, body }) => (
                <div key={title} className="group rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary/40">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-elevated text-primary-light transition-colors group-hover:border-primary/30">
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
        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
            <div>
              <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary-light">
                <Radar size={13} /> AI rule monitoring
              </span>
              <h2 className="text-balance text-3xl font-bold tracking-tight text-text-primary sm:text-[2.2rem]">
                Prop firm changed the rules?<br />
                <span className="text-primary-light">We already know.</span>
              </h2>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-text-secondary">
                Our AI agent monitors your prop firm around the clock — drawdown limits, daily loss,
                consistency rules, news windows. When a firm updates its terms, the change is detected,
                human-verified, and live in your guardrails before it can catch you out. Every ruleset
                shows when it was last verified, so you&rsquo;re never trading on stale rules.
              </p>
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2.5">
                {([
                  [Eye, "24/7 monitoring"],
                  [UserCheck, "Human-verified"],
                  [History, "Last-verified timestamps"],
                ] as [React.ElementType, string][]).map(([I, label]) => (
                  <span key={label} className="flex items-center gap-2 text-[13px] font-medium text-text-secondary">
                    <I size={15} className="text-primary" /> {label}
                  </span>
                ))}
              </div>
              <p className="mt-6 text-xs text-text-muted">Available on the Funded plan.</p>
            </div>

            <div className="flex justify-center lg:justify-end">
              <div className="ticket-shadow w-full max-w-sm rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between border-b border-border/70 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary-light">
                      <Radar size={17} />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-text-primary">Rule change detected</div>
                      <div className="text-[11px] text-text-muted">Prop-firm monitor</div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary-light">
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-primary" />Live
                  </span>
                </div>
                <div className="mt-3.5 rounded-xl border border-border bg-surface-elevated p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-text-primary">FundingPips</span>
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-primary-light">
                      <CheckCircle2 size={13} /> Verified today
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="text-xs text-text-secondary">Daily loss</span>
                    <div className="flex items-center gap-2">
                      <span className="num rounded-md border border-border bg-surface px-2 py-1 text-[13px] text-text-secondary line-through">5%</span>
                      <ArrowRight size={14} className="text-text-muted" />
                      <span className="num rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[13px] font-semibold text-primary-light">4%</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3.5 flex items-center justify-between rounded-xl border border-primary/25 bg-primary/[0.07] px-3.5 py-3">
                  <span className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                    <ShieldCheck size={15} className="text-primary-light" /> Guardrail updated
                  </span>
                  <span className="text-[11px] text-text-muted">Auto-applied</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pricing ───────────────────────────────────────────────────── */}
        <section id="pricing" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-8 lg:py-24">
          <SectionHeader
            eyebrow="Pricing"
            title="Clear, predictable pricing"
            sub="Start free for 7 days — no card. Then pick the plan that fits how you trade."
            center
          />
          <div className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs text-text-secondary">
            <Info size={13} className="text-primary" /> 1 signal/day on trial — unlimited on any paid plan.
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  p.popular ? "border-primary/60 bg-surface-elevated ring-1 ring-primary/30" : "border-border bg-surface"
                }`}
              >
                {p.popular && (
                  <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#04201D]">
                    Most popular
                  </span>
                )}
                <div className="text-sm font-semibold text-text-primary">{p.name}</div>
                <div className="mt-1 text-xs text-text-muted">{p.tagline}</div>
                <div className="mt-4 flex items-baseline gap-0.5">
                  <span className="num text-3xl font-bold tracking-tight text-text-primary">{p.price}</span>
                  <span className="text-sm text-text-secondary">{p.cadence}</span>
                </div>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-text-secondary">
                      <Check size={15} className={`mt-0.5 shrink-0 ${p.popular ? "text-primary-light" : "text-primary"}`} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {p.popular ? (
                  <Link href="/signup" className={`${PRIMARY_BTN} ${BTN_MD} mt-6 w-full`}>Start free trial</Link>
                ) : (
                  <Link href="/signup" className={`${GHOST_BTN} ${BTN_MD} mt-6 w-full`}>Start free trial</Link>
                )}
              </div>
            ))}
          </div>
          <div className="mt-7 flex items-center justify-center gap-2 text-sm text-text-secondary">
            <Wallet size={16} className="text-primary" />
            Pay by card (USD) or in naira.&nbsp;<span className="text-text-muted">Card via Stripe · naira via Paystack.</span>
          </div>
        </section>

        {/* ── CTA band ──────────────────────────────────────────────────── */}
        <section className="border-t border-border bg-surface/40">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
            <div className="grid-glow relative overflow-hidden rounded-2xl border border-border bg-surface p-8 text-center sm:p-12">
              <div className="dot-grid absolute inset-0 opacity-50" />
              <div className="relative">
                <h2 className="text-balance text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
                  Never miss a signal again.
                </h2>
                <p className="mx-auto mt-3 max-w-lg text-[15px] text-text-secondary">
                  Connect your channels and your broker, set your risk, and let VouchFX execute — while you keep full control.
                </p>
                <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link href="/signup" className={`${PRIMARY_BTN} ${BTN_LG}`}>
                    Start 7-day free trial <ArrowRight size={18} />
                  </Link>
                  <a href="#how" className={`${GHOST_BTN} ${BTN_LG}`}>See how it works</a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Affiliate / referral band ─────────────────────────────────── */}
        <section id="affiliates" className="scroll-mt-20 border-t border-border bg-bg">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-24">
            <div className="flex flex-col items-center text-center">
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary-light">
                <Percent size={13} /> Earn 20%
              </span>
              <h2 className="text-balance text-3xl font-bold tracking-tight text-text-primary sm:text-[2.2rem]">
                Share VouchFX, earn 20%
              </h2>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-text-secondary">
                Whether you trade or run a channel, get paid every month for the people you bring on.
              </p>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-2">
              {[
                {
                  Icon: Gift, tag: "For traders", title: "Refer a friend",
                  body: "They get 20% off their first month. You get 20% recurring as account credit — for as long as they stay subscribed.",
                  cta: "Invite a friend",
                },
                {
                  Icon: Radio, tag: "For channel owners", title: "Run a signal channel?",
                  body: "Turn your audience into recurring income. Earn 20% recurring commission for every trader you refer, paid out every month.",
                  cta: "Become an affiliate",
                },
              ].map(({ Icon, tag, title, body, cta }) => (
                <div key={title} className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface p-7 transition-colors hover:border-primary/40">
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary-light">
                      <Icon size={20} />
                    </div>
                    <span className="text-xs font-medium uppercase tracking-wider text-text-muted">{tag}</span>
                  </div>
                  <div className="mt-5 flex items-baseline gap-2">
                    <span className="num text-4xl font-bold tracking-tight text-primary-light">20%</span>
                    <span className="text-sm text-text-secondary">recurring</span>
                  </div>
                  <h3 className="mt-3 text-xl font-semibold text-text-primary">{title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-text-secondary">{body}</p>
                  <Link
                    href="/signup?affiliate=1"
                    className="group mt-6 inline-flex items-center gap-2 self-start rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-[#04201D] shadow-[0_8px_24px_-8px_rgba(20,184,166,0.6)] transition-all hover:bg-primary-light active:translate-y-px"
                  >
                    {cta} <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Community strip ───────────────────────────────────────────── */}
        <section className="border-t border-border bg-bg">
          <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
            <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-border bg-surface/60 px-6 py-5 text-center sm:flex-row sm:text-left">
              <p className="flex items-center gap-2.5 text-[15px] text-text-secondary">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated text-primary-light">
                  <Send size={15} />
                </span>
                Questions? Join the VouchFX community on Telegram.
              </p>
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`${GHOST_BTN} ${BTN_MD} shrink-0`}
              >
                <Send size={16} /> Open Telegram
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-bg">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <Link href="/" className="flex items-center gap-2.5">
                <Mark size={26} />
                <span className="text-[17px] font-bold tracking-tight text-text-primary">
                  Vouch<span className="text-primary">FX</span>
                </span>
              </Link>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-text-secondary">
                The cleanest, fastest, most transparent Telegram-to-MT5 copier. Signals you choose, executed on rules you set.
              </p>
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-text-primary transition-colors hover:border-primary/40 hover:text-primary-light"
              >
                <Send size={15} /> Join our Telegram
              </a>
            </div>

            {([
              ["Product", [["Features", "#features"], ["How it works", "#how"], ["Pricing", "#pricing"], ["Affiliates", "#affiliates"], ["Audit log", "#"]]],
              ["Company", [["About", "#"], ["Support", "#"], ["Status", "#"], ["Contact", "#"]]],
              ["Legal", [["Terms", "#"], ["Privacy", "#"], ["Risk disclosure", "#"]]],
            ] as [string, [string, string][]][]).map(([title, items]) => (
              <div key={title}>
                <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">{title}</div>
                <ul className="mt-4 space-y-2.5">
                  {items.map(([label, href]) => (
                    <li key={label}>
                      <a href={href} className="text-sm text-text-secondary transition-colors hover:text-text-primary">
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-xl border border-border bg-surface/50 p-4">
            <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-text-muted">
              <Info size={15} className="mt-0.5 shrink-0 text-text-muted" />
              VouchFX is an execution tool you control. It does not provide financial advice or guarantee outcomes. Trading involves risk.
            </p>
          </div>

          <div className="mt-6 flex flex-col items-center justify-between gap-3 text-xs text-text-muted sm:flex-row">
            <span>© 2026 VouchFX. All rights reserved.</span>
            <span className="flex items-center gap-1.5">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-profit" />
              All systems operational
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
