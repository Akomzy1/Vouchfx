"use client";

import { useState, useRef, useCallback } from "react";
import {
  Copy, Check, Users, Gift, Link2, Globe, Send, Hash, MessageSquareText,
  MousePointerClick, UserPlus, Hourglass, Banknote, Wallet, Landmark,
  CreditCard, CalendarClock, Info, UserMinus, Clock, Megaphone, UserRound,
  Share2, Tag, PiggyBank, Download, Loader2, CheckCircle2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stats {
  totalClicks:          number;
  totalSignups:         number;
  totalActiveReferrals: number;
  pendingPayoutUsd:     number;
  lifetimePaidUsd:      number;
  payoutEligible:       boolean;
}

interface ReferralRow { id: string; status: string; first_paid_at: string | null; created_at: string }
interface PayoutRow   { id: string; amount_usd: number; status: string; method: string; paid_at: string | null; created_at: string }

interface Props {
  referralCode: string;
  referralLink: string;
  telegramText: string;
  stats: Stats;
  payoutMethod: string | null;
  referrals: ReferralRow[];
  payouts: PayoutRow[];
  ownReferral: { referral_code: string; first_month_discount_applied: boolean } | null;
}

type Tab = "affiliate" | "user";
type PayoutMethod = "paystack" | "bank_transfer" | "stripe";

const PAYOUT_MINIMUM_USD = 50;

const fmtUSD = (n: number) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function nextPayoutDate(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

const REF_STATUS: Record<string, { label: string; Icon: React.ElementType; cls: string }> = {
  converted: { label: "Active",  Icon: Check,     cls: "border-profit/30 bg-profit/10 text-profit" },
  pending:   { label: "Trial",   Icon: Hourglass, cls: "border-warning/30 bg-warning/10 text-warning" },
  churned:   { label: "Churned", Icon: UserMinus, cls: "border-loss/30 bg-loss/10 text-loss" },
};

// ── Share card (shared between tabs) ─────────────────────────────────────────

function ShareCard({
  link, code, telegramText, onToast,
}: {
  link: string;
  code: string;
  telegramText: string;
  onToast: (msg: string) => void;
}) {
  const copy = (text: string, label: string) => {
    try { navigator.clipboard?.writeText(text); } catch { /* clipboard unavailable */ }
    onToast(label);
  };

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=232x232&data=${encodeURIComponent(link)}&color=E6EDF3&bgcolor=0B0F14&margin=2`;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="grid-glow grid grid-cols-1 gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:gap-7">
        {/* Link + actions */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            <Link2 size={13} className="text-primary-light" /> Your referral link
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-bg/50 px-3.5 py-2.5">
              <Globe size={15} className="shrink-0 text-text-muted" />
              <span className="num truncate text-[13px] text-text-primary">{link.replace(/^https?:\/\//, "")}</span>
            </div>
            <button
              onClick={() => copy(link, "Referral link copied to clipboard")}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-[#04201D] transition-colors hover:bg-primary-light"
            >
              <Copy size={15} strokeWidth={2.4} /> Copy
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => copy(telegramText, "Telegram invite message copied")}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3.5 py-2 text-[12.5px] font-semibold text-text-primary transition-colors hover:border-primary/40 hover:text-primary-light"
            >
              <Send size={14} /> Copy Telegram message
            </button>
            <button
              onClick={() => copy(code, "Referral code copied")}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3.5 py-2 text-[12.5px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
            >
              <Hash size={14} className="text-text-muted" /> Code <span className="num text-text-primary">{code}</span>
            </button>
          </div>
          {/* Invite preview */}
          <div className="mt-3.5 rounded-xl border border-border bg-bg/40 p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-text-muted">
              <MessageSquareText size={12} className="text-primary-light" /> Ready-to-send invite
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-text-secondary">{telegramText}</p>
          </div>
        </div>

        {/* QR block */}
        <div className="flex shrink-0 flex-col items-center justify-center gap-2.5 rounded-2xl border border-border bg-bg/40 p-4 lg:w-[176px]">
          <div className="overflow-hidden rounded-xl border border-border bg-[#0B0F14] p-3">
            <img src={qrSrc} alt="QR code to your referral link" width={116} height={116} className="h-[116px] w-[116px]" />
          </div>
          <div className="text-center">
            <div className="text-[12px] font-semibold text-text-primary">Scan to share</div>
            <div className="text-[11px] text-text-muted">Opens your link</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, Icon: SIcon, sub, tone,
}: {
  label: string;
  value: string;
  Icon: React.ElementType;
  sub: string;
  tone?: "profit" | "warn" | "teal";
}) {
  const valColor = tone === "profit" ? "text-profit" : tone === "warn" ? "text-warning" : tone === "teal" ? "text-primary-light" : "text-text-primary";
  const iconWrap = tone === "profit" ? "border-profit/25 bg-profit/10 text-profit"
    : tone === "warn" ? "border-warning/25 bg-warning/10 text-warning"
    : tone === "teal" ? "border-primary/25 bg-primary/10 text-primary-light"
    : "border-border bg-surface-elevated text-text-secondary";
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-medium text-text-secondary">{label}</span>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${iconWrap}`}>
          <SIcon size={14} />
        </span>
      </div>
      <div>
        <div className={`num text-[24px] font-bold leading-none ${valColor}`}>{value}</div>
        <div className="mt-1.5 text-[11px] text-text-muted">{sub}</div>
      </div>
    </div>
  );
}

// ── Referrals table ───────────────────────────────────────────────────────────

function ReferralsTable({ referrals }: { referrals: ReferralRow[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Users size={16} className="text-primary-light" />
          <h3 className="text-[14px] font-bold tracking-tight text-text-primary">Your referrals</h3>
          <span className="num rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
            {referrals.length}
          </span>
        </div>
      </div>

      {referrals.length === 0 ? (
        <div className="px-5 py-10 text-center text-[13px] text-text-muted">
          No referrals yet — share your link to get started.
        </div>
      ) : (
        <>
          <div className="hidden grid-cols-[1.6fr_1fr_1fr_1fr] items-center gap-3 border-b border-border/40 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted sm:grid">
            <span>Referral</span>
            <span>Status</span>
            <span className="text-right">Converted</span>
            <span className="text-right">Joined</span>
          </div>
          <div className="divide-y divide-border/50">
            {referrals.map((r) => {
              const st = REF_STATUS[r.status] ?? { label: r.status, Icon: Clock, cls: "border-border bg-surface text-text-secondary" };
              const StIcon = st.Icon;
              return (
                <div key={r.id} className="grid grid-cols-2 items-center gap-x-3 gap-y-2 px-5 py-3.5 sm:grid-cols-[1.6fr_1fr_1fr_1fr]">
                  <div className="col-span-2 flex items-center gap-2.5 sm:col-span-1">
                    <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated text-[11px] font-bold text-text-secondary">
                      {r.id.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="num truncate text-[12.5px] text-text-primary">Trader · {r.id.slice(0, 8)}</span>
                  </div>
                  <div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>
                      <StIcon size={11} strokeWidth={2.4} /> {st.label}
                    </span>
                  </div>
                  <div className="num text-[12px] text-text-secondary sm:text-right">
                    {r.first_paid_at ? fmtDate(r.first_paid_at) : "—"}
                  </div>
                  <div className="num text-[12px] text-text-secondary sm:text-right">{fmtDate(r.created_at)}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

// ── Payout panel ──────────────────────────────────────────────────────────────

function PayoutPanel({
  stats, payoutMethod, payouts, onToast,
}: {
  stats: Stats;
  payoutMethod: string | null;
  payouts: PayoutRow[];
  onToast: (msg: string) => void;
}) {
  const balance = stats.pendingPayoutUsd;
  const pct = Math.min(100, (balance / PAYOUT_MINIMUM_USD) * 100);
  const eligible = stats.payoutEligible;
  const [method, setMethod] = useState<PayoutMethod>(
    (payoutMethod as PayoutMethod | null) ?? "bank_transfer"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const methods: [PayoutMethod, string, string, React.ElementType][] = [
    ["paystack", "Paystack", "NGN", Banknote],
    ["bank_transfer", "Bank / Wise", "USD", Landmark],
    ["stripe", "Stripe", "USD", CreditCard],
  ];

  const request = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/affiliate/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Payout request failed");
        return;
      }
      setDone(true);
      onToast(`Payout of $${fmtUSD(balance)} requested`);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [method, balance, onToast]);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center gap-2.5 border-b border-border/60 px-5 py-4">
        <Wallet size={16} className="text-primary-light" />
        <h3 className="text-[14px] font-bold tracking-tight text-text-primary">Payout</h3>
      </div>
      <div className="p-5">
        {/* Balance vs threshold */}
        <div className="rounded-xl border border-border bg-bg/40 p-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Available balance</div>
              <div className={`num mt-1 text-[28px] font-bold leading-none ${eligible ? "text-profit" : "text-text-primary"}`}>
                ${fmtUSD(balance)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-text-muted">Minimum</div>
              <div className="num text-[14px] font-semibold text-text-primary">${fmtUSD(PAYOUT_MINIMUM_USD)}</div>
            </div>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-border">
            <div className={`h-full rounded-full ${eligible ? "bg-profit" : "bg-primary"}`} style={{ width: `${pct}%` }} />
          </div>
          {eligible ? (
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-profit">
              <CheckCircle2 size={13} /> Above the ${fmtUSD(PAYOUT_MINIMUM_USD)} threshold — you can request a payout.
            </p>
          ) : (
            <p className="mt-2 text-[11.5px] text-text-muted">
              ${fmtUSD(PAYOUT_MINIMUM_USD - balance)} more to reach the payout threshold.
            </p>
          )}
        </div>

        {/* Method selector */}
        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Payout method</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {methods.map(([id, name, cur, MIcon]) => {
              const on = method === id;
              return (
                <button
                  key={id}
                  onClick={() => setMethod(id)}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${on ? "border-primary/50 bg-primary/[0.06]" : "border-border bg-bg/40 hover:border-text-muted"}`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${on ? "border-primary/30 bg-primary/10 text-primary-light" : "border-border bg-surface-elevated text-text-secondary"}`}>
                    <MIcon size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-semibold text-text-primary">{name}</span>
                    <span className="num block text-[10.5px] text-text-muted">{cur}</span>
                  </span>
                  {on && <Check size={14} strokeWidth={2.6} className="ml-auto text-primary-light" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Next payout */}
        <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-bg/40 px-3.5 py-3">
          <div className="flex items-center gap-2 text-[12.5px] text-text-secondary">
            <CalendarClock size={15} className="text-text-muted" /> Next payout
          </div>
          <div className="num text-[12.5px] font-semibold text-text-primary">{nextPayoutDate()}</div>
        </div>

        {error && <p className="mt-3 text-center text-xs text-loss">{error}</p>}

        <button
          disabled={!eligible || loading || done}
          onClick={request}
          className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-bold transition-colors ${
            eligible && !done
              ? "bg-primary text-[#04201D] hover:bg-primary-light"
              : "cursor-not-allowed border border-border bg-surface-elevated text-text-muted"
          }`}
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : done ? <Check size={15} strokeWidth={2.4} /> : <Send size={15} strokeWidth={2.4} />}
          {done ? "Payout requested" : "Request payout"}
        </button>

        {/* Payout history */}
        {payouts.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-bg/40">
            <div className="flex items-center gap-1.5 border-b border-border/60 px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              <Download size={12} /> Payout history
            </div>
            <div className="divide-y divide-border/40">
              {payouts.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center justify-between px-3.5 py-2.5 text-[12px]">
                  <span className="num font-semibold text-text-primary">${fmtUSD(Number(p.amount_usd))}</span>
                  <span className="text-text-muted">{p.method === "bank_transfer" ? "Bank / Wise" : p.method}</span>
                  <span className={`capitalize ${p.status === "paid" ? "text-profit" : p.status === "failed" ? "text-loss" : "text-warning"}`}>{p.status}</span>
                  <span className="num text-text-muted">{fmtDate(p.paid_at ?? p.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fine print */}
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-bg/40 px-3.5 py-3 text-[11.5px] leading-relaxed text-text-muted">
          <Info size={13} className="mt-px shrink-0 text-text-secondary" />
          Commission is 20% of collected subscription payments; trials don&rsquo;t earn until they convert; refunds are clawed back.
        </p>
      </div>
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReferTabs({
  referralCode, referralLink, telegramText,
  stats, payoutMethod, referrals, payouts, ownReferral,
}: Props) {
  const [tab, setTab] = useState<Tab>("affiliate");
  const [toast, setToast] = useState<string | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const conversionPct = stats.totalClicks > 0
    ? `${((stats.totalSignups / stats.totalClicks) * 100).toFixed(1)}% of clicks`
    : "via your link";

  const convertedCount = referrals.filter((r) => r.status === "converted").length;

  return (
    <div>
      {/* Tabs */}
      <div className="mb-5 inline-flex rounded-xl border border-border bg-surface p-1" role="radiogroup">
        {([
          ["affiliate", "Signal providers", Megaphone],
          ["user", "My referrals", UserRound],
        ] as [Tab, string, React.ElementType][]).map(([key, label, TIcon]) => {
          const on = tab === key;
          return (
            <button
              key={key}
              role="radio"
              aria-checked={on}
              onClick={() => setTab(key)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                on ? "bg-primary/15 text-primary-light ring-1 ring-primary/30" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <TIcon size={14} /> {label}
            </button>
          );
        })}
      </div>

      {/* Referred-by banner */}
      {ownReferral && (
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
          <Gift size={14} className="shrink-0 text-primary-light" />
          You were referred via code <span className="num text-text-primary">{ownReferral.referral_code}</span>.
          {!ownReferral.first_month_discount_applied && (
            <span className="text-profit"> Your 20% first-month discount will apply at checkout.</span>
          )}
        </div>
      )}

      {/* Shared share card */}
      <div className="mb-7">
        <ShareCard link={referralLink} code={referralCode} telegramText={telegramText} onToast={flash} />
      </div>

      {tab === "affiliate" ? (
        <div className="flex flex-col gap-7">
          <div>
            <h2 className="text-[20px] font-bold tracking-tight text-text-primary sm:text-[24px]">
              Earn <span className="text-primary-light">20% recurring</span> for every trader you refer.
            </h2>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
              Share VouchFX with your signal channel or audience. You earn 20% of every subscription
              payment they make — for as long as they keep copying. Paid monthly.
            </p>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Clicks" value={stats.totalClicks.toLocaleString()} Icon={MousePointerClick} sub="all time" />
            <StatCard label="Signups" value={stats.totalSignups.toLocaleString()} Icon={UserPlus} sub={conversionPct} />
            <StatCard label="Active referrals" value={stats.totalActiveReferrals.toLocaleString()} Icon={Users} sub="paying now" tone="teal" />
            <StatCard label="Pending" value={`$${fmtUSD(stats.pendingPayoutUsd)}`} Icon={Hourglass} sub="clears on payout" tone="warn" />
            <StatCard label="Lifetime paid" value={`$${fmtUSD(stats.lifetimePaidUsd)}`} Icon={Banknote} sub="all time" />
          </div>

          {/* Table + payout */}
          <div className="grid grid-cols-1 gap-7 lg:grid-cols-[1fr_360px]">
            <ReferralsTable referrals={referrals} />
            <div className="lg:sticky lg:top-20 lg:self-start">
              <PayoutPanel stats={stats} payoutMethod={payoutMethod} payouts={payouts} onToast={flash} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          <div>
            <h2 className="text-[20px] font-bold tracking-tight text-text-primary sm:text-[24px]">
              Give <span className="text-primary-light">20% off</span>, get{" "}
              <span className="text-profit">20% credit</span>.
            </h2>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
              Friends you refer get <span className="font-semibold text-text-primary">20% off their first month</span>.
              You earn <span className="font-semibold text-text-primary">20% recurring</span> toward your payout
              balance — for as long as they stay subscribed.
            </p>
          </div>

          {/* How it works */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {([
              ["Send your link", "Share your link or code with trading friends.", Share2],
              ["They save 20%", "Your friend's first month is 20% off automatically.", Tag],
              ["You earn 20%", "20% of their payments lands in your payout balance.", PiggyBank],
            ] as [string, string, React.ElementType][]).map(([t, d, HIcon], i) => (
              <div key={t} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4">
                <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-[12px] font-bold text-primary-light">
                  {i + 1}
                </span>
                <div>
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
                    <HIcon size={14} className="text-primary-light" /> {t}
                  </div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-text-muted">{d}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Friend summary cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {([
              ["Friends invited", String(referrals.length), UserPlus, "via your link", undefined],
              ["Friends subscribed", String(convertedCount), Users, "now paying", "teal"],
              ["Pending earnings", `$${fmtUSD(stats.pendingPayoutUsd)}`, PiggyBank, "clears on payout", "profit"],
            ] as [string, string, React.ElementType, string, "teal" | "profit" | undefined][]).map(([label, value, CIcon, sub, tone]) => (
              <StatCard key={label} label={label} value={value} Icon={CIcon} sub={sub} tone={tone} />
            ))}
          </div>

          {/* Referrals list */}
          <ReferralsTable referrals={referrals} />
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="anim-fade fixed bottom-24 left-1/2 z-[80] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 lg:bottom-8">
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-elevated px-4 py-3 shadow-2xl">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary-light">
              <Check size={15} strokeWidth={2.5} />
            </span>
            <span className="text-[13px] font-medium text-text-primary">{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
