import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  CircleCheck,
  Ban,
  Clock,
  ShieldCheck,
  ShieldX,
  Hash,
  Cpu,
  Send,
  Check,
  X,
  BadgeCheck,
  MessageSquareText,
  ScanLine,
  Brain,
  Sparkles,
  ListChecks,
  ShieldAlert,
  Split,
  CircleSlash,
  Activity,
  Milestone,
  MinusCircle,
  SlidersHorizontal,
  Lock,
  Target,
  TriangleAlert,
  FlaskConical,
} from "lucide-react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

// Executor skips below this parse confidence (see packages/config)
const CONFIDENCE_THRESHOLD = 0.85;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  return { title: `Signal · ${(await params).id.slice(0, 8)}` };
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtPrice(n: number | null | undefined, decimals = 5) {
  if (n == null) return "—";
  return n.toFixed(n >= 100 ? 2 : decimals);
}

function modelLabel(id: string | null) {
  if (!id) return "—";
  if (id.includes("haiku")) return "Claude Haiku 4.5";
  if (id.includes("sonnet")) return "Claude Sonnet 4.6";
  if (id.includes("opus")) return "Claude Opus 4.8";
  return id;
}

type Tone = "teal" | "profit" | "warn" | "loss";

const TONE_TEXT: Record<Tone, string> = {
  teal: "text-primary-light",
  profit: "text-profit",
  warn: "text-warning",
  loss: "text-loss",
};
const TONE_RING: Record<Tone, string> = {
  teal: "border-primary/30 bg-primary/10",
  profit: "border-profit/30 bg-profit/10",
  warn: "border-warning/30 bg-warning/10",
  loss: "border-loss/30 bg-loss/10",
};
const TONE_PILL: Record<Tone, string> = {
  teal: "border-primary/30 bg-primary/10 text-primary-light",
  profit: "border-profit/30 bg-profit/10 text-profit",
  warn: "border-warning/30 bg-warning/10 text-warning",
  loss: "border-loss/30 bg-loss/10 text-loss",
};

function SideTag({ side, lg }: { side: string; lg?: boolean }) {
  const buy = side === "BUY";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-semibold ${
        lg ? "px-2 py-1 text-[12px]" : "px-1.5 py-0.5 text-[11px]"
      } ${buy ? "border-primary/30 bg-primary/10 text-primary-light" : "border-border bg-surface-elevated text-text-secondary"}`}
    >
      {buy ? <ArrowUpRight size={lg ? 13 : 11} strokeWidth={2.5} /> : <ArrowDownRight size={lg ? 13 : 11} strokeWidth={2.5} />}
      {side}
    </span>
  );
}

/* ── Step wrapper (numbered, with connecting rail) ─────────────────────────── */

function Step({
  n, title, icon: Icon, tone = "teal", last, children, badge,
}: {
  n: string;
  title: string;
  icon: React.ElementType;
  tone?: Tone;
  last?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="relative flex gap-3.5 sm:gap-5">
      {/* rail */}
      <div className="relative flex w-9 shrink-0 flex-col items-center sm:w-10">
        <span className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-xl border ${TONE_RING[tone]} ${TONE_TEXT[tone]} sm:h-10 sm:w-10`}>
          <Icon size={17} />
        </span>
        {!last && <span className="mt-1.5 w-px flex-1 bg-border" />}
      </div>
      {/* card */}
      <div className={`min-w-0 flex-1 ${last ? "pb-1" : "pb-6"}`}>
        <div className="mb-2.5 flex items-center gap-2">
          <span className="num text-[11px] font-semibold text-text-muted">STEP {n}</span>
          <h2 className="text-[15px] font-semibold tracking-tight text-text-primary">{title}</h2>
          {badge && <span className="ml-auto">{badge}</span>}
        </div>
        <div className="rounded-2xl border border-border bg-surface">{children}</div>
      </div>
    </div>
  );
}

function CheckRow({ label, detail, ok, last }: { label: string; detail: string; ok: boolean; last: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${last ? "" : "border-b border-border/60"}`}>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${ok ? "border-profit/30 bg-profit/10 text-profit" : "border-loss/30 bg-loss/10 text-loss"}`}>
        {ok ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-text-primary">{label}</div>
        <div className={`mt-0.5 text-[11.5px] ${ok ? "text-text-muted" : "text-loss"}`}>{detail}</div>
      </div>
      <span className={`num text-[11px] font-semibold ${ok ? "text-profit" : "text-loss"}`}>{ok ? "PASS" : "FAIL"}</span>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────── */

type AuditEvent = {
  id: string;
  event_type: string;
  trade_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export default async function SignalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [{ data: signal }, { data: trades }, { data: events }] = await Promise.all([
    db.from("parsed_signals")
      .select("id, source_id, symbol, side, order_type, entries, sl, sl_unit, tps, tp_unit, confidence, reasoning, follow_up_type, language_detected, model_used, raw_text, is_signal, parsed_at, created_at")
      .eq("id", id)
      .single(),
    db.from("trades")
      .select("id, symbol, side, volume, entry_price, sl, tp, status, skip_reason, breakeven_applied, is_simulated, opened_at, closed_at, created_at")
      .eq("parsed_signal_id", id)
      .order("created_at"),
    db.from("audit_events")
      .select("id, event_type, trade_id, payload, created_at")
      .eq("parsed_signal_id", id)
      .order("created_at"),
  ]);

  if (!signal) notFound();

  const { data: sourceRow } = await db
    .from("signal_sources")
    .select("title, telegram_chat_id")
    .eq("id", (signal as { source_id: string }).source_id)
    .maybeSingle();

  const sig = signal as {
    id: string;
    symbol: string | null;
    side: string | null;
    order_type: string | null;
    entries: number[];
    sl: number | null;
    sl_unit: string | null;
    tps: number[];
    tp_unit: string | null;
    confidence: number;
    reasoning: string;
    follow_up_type: string | null;
    language_detected: string;
    model_used: string;
    raw_text: string | null;
    is_signal: boolean;
    parsed_at: string;
    created_at: string;
  };

  const tradeRows = (trades ?? []) as {
    id: string;
    symbol: string;
    side: string;
    volume: number;
    entry_price: number | null;
    sl: number | null;
    tp: number | null;
    status: string;
    skip_reason: string | null;
    breakeven_applied: boolean;
    is_simulated: boolean;
    opened_at: string | null;
    closed_at: string | null;
    created_at: string;
  }[];

  const auditEvents = (events ?? []) as AuditEvent[];

  const channelTitle = (sourceRow?.title as string | undefined) ?? "Telegram channel";
  const executedEvent = auditEvents.find((e) => e.event_type === "executed");
  const skippedEvent = auditEvents.find((e) => e.event_type === "skipped");
  const skipReason = skippedEvent
    ? String((skippedEvent.payload ?? {}).reason ?? "unknown").replace(/_/g, " ")
    : null;

  const placedLegs = tradeRows.filter((t) => t.status !== "SKIPPED");
  const placed = placedLegs.length > 0;

  const status = (() => {
    if (tradeRows.some((t) => t.status === "OPEN")) return { label: "Executed", tone: "profit" as Tone, Icon: CircleCheck };
    if (tradeRows.some((t) => t.status === "PENDING")) return { label: "Pending", tone: "teal" as Tone, Icon: Clock };
    if (tradeRows.some((t) => t.status === "CLOSED")) return { label: "Closed", tone: "teal" as Tone, Icon: CircleCheck };
    if (skippedEvent) return { label: "Skipped", tone: "warn" as Tone, Icon: Ban };
    if (placed) return { label: "Executed", tone: "profit" as Tone, Icon: CircleCheck };
    return { label: "Received", tone: "teal" as Tone, Icon: Clock };
  })();
  const StatusIcon = status.Icon;
  const skipped = status.label === "Skipped";

  /* Parsed field rows */
  const parsedFields: [string, string, boolean][] = [
    ["Symbol", sig.symbol ?? "—", !sig.symbol],
    ["Side", sig.side ?? "—", false],
    ["Order type", sig.order_type ?? "Market", false],
    [
      sig.entries.length > 1 ? "Entry range" : "Entry",
      sig.entries.length > 0 ? sig.entries.map((e) => fmtPrice(e)).join(" – ") : "Market",
      false,
    ],
    [
      `Stop loss${sig.sl_unit && sig.sl_unit !== "price" ? ` (${sig.sl_unit})` : ""}`,
      sig.sl != null ? fmtPrice(sig.sl) : "Not found",
      sig.sl == null,
    ],
    ...sig.tps.map((tp, i): [string, string, boolean] => [`Take profit ${i + 1}`, fmtPrice(tp), false]),
  ];

  /* Validation checks — derived from real data only */
  const checks: [string, string, boolean][] = [
    [
      "Stop loss present",
      sig.sl != null ? `${fmtPrice(sig.sl)} — risk defined` : "No SL detected in message",
      sig.sl != null,
    ],
    [
      "Parse confidence threshold",
      `${Math.round(sig.confidence * 100)}% — threshold ${Math.round(CONFIDENCE_THRESHOLD * 100)}%`,
      sig.confidence >= CONFIDENCE_THRESHOLD,
    ],
    skipped
      ? ["Risk gate", skipReason ?? "skipped", false]
      : ["Risk gate", placed ? "All caps within limits" : "Pending evaluation", placed],
  ];
  const checksPassed = checks.filter((c) => c[2]).length;
  const allOk = checksPassed === checks.length;

  /* Order ticket numbers */
  const totalLots = placedLegs.reduce((a, t) => a + (t.volume ?? 0), 0);
  const riskApplied = (() => {
    const p = executedEvent?.payload ?? {};
    if (typeof p.dollar_risk === "number" && typeof p.account_balance === "number" && p.account_balance > 0) {
      return `${(((p.dollar_risk as number) / (p.account_balance as number)) * 100).toFixed(2)}%`;
    }
    return "—";
  })();
  const fillPrice = placedLegs.find((t) => t.entry_price != null)?.entry_price ?? null;

  /* Outcome timeline from audit events */
  const timelineTone: Record<string, [React.ElementType, Tone]> = {
    received: [Clock, "teal"],
    parsed: [ScanLine, "teal"],
    executed: [CircleCheck, "teal"],
    modified: [ShieldCheck, "teal"],
    closed: [Target, "profit"],
    skipped: [TriangleAlert, "warn"],
    cancelled: [X, "warn"],
    error: [TriangleAlert, "loss"],
  };

  function eventDetail(e: AuditEvent): string {
    const p = e.payload ?? {};
    switch (e.event_type) {
      case "received":
        return `Message #${p.message_id ?? "—"} · edit v${p.edit_version ?? 0}`;
      case "parsed":
        return `${p.side ?? ""} ${p.symbol ?? ""} · confidence ${typeof p.confidence === "number" ? Math.round((p.confidence as number) * 100) + "%" : "—"} · ${modelLabel((p.model as string) ?? null)}`;
      case "executed":
        return `${p.side ?? ""} ${p.symbol ?? ""} · ${p.legs ?? 1} leg${Number(p.legs ?? 1) > 1 ? "s" : ""} · vol ${p.volume ?? "—"}`;
      case "modified":
        return p.action === "breakeven_applied"
          ? `Stop trailed to ${p.entry_price ?? "entry"} — risk-free runner`
          : String(p.follow_up_type ?? "Order modified").replace(/_/g, " ");
      case "skipped":
        return String(p.reason ?? "unknown").replace(/_/g, " ");
      case "cancelled":
        return p.source === "telegram_delete" ? "Cancelled by Telegram message delete" : "Pending order cancelled";
      case "closed":
        return p.reason === "drawdown_cap_close_all" ? "Closed by drawdown guardian" : `${p.legs ?? 1} position(s) closed`;
      case "error":
        return String(p.error ?? "unknown error").slice(0, 80);
      default:
        return "";
    }
  }

  function eventTitle(e: AuditEvent): string {
    return {
      received: "Signal received",
      parsed: "Parsed",
      executed: "Order opened",
      modified: "Order modified",
      skipped: "Signal skipped",
      cancelled: "Order cancelled",
      closed: "Position closed",
      error: "Execution error",
    }[e.event_type] ?? e.event_type;
  }

  const lotsOpen = tradeRows.filter((t) => t.status === "OPEN").reduce((a, t) => a + t.volume, 0);
  const lotsClosed = tradeRows.filter((t) => t.status === "CLOSED").reduce((a, t) => a + t.volume, 0);

  return (
    <div className="mx-auto max-w-[860px]">
      {/* Title row */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/signals"
            className="mb-2 inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <ChevronLeft size={16} /> Signals
          </Link>
          <div className="flex items-center gap-2 text-[12px] text-text-muted">
            <MessageSquareText size={13} className="text-primary-light" />
            <span className="font-medium uppercase tracking-wide">Signal audit trail</span>
          </div>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-text-primary">Signal detail</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            Exactly what VouchFX saw, decided, and did — end to end.
          </p>
        </div>
      </div>

      {/* Header card */}
      <div className="anim-fade overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="grid-glow flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5">
          <div className="flex items-center gap-3.5">
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface-elevated text-primary-light">
              <Send size={20} />
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-primary text-[#04201D]">
                <Check size={11} strokeWidth={3} />
              </span>
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-bold tracking-tight text-text-primary">{channelTitle}</h2>
              <div className="num mt-0.5 text-[12px] text-text-muted">{fmt(sig.created_at)}</div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 sm:ml-auto">
            {sig.symbol && (
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-bg/40 px-3 py-2">
                <div>
                  <div className="num text-[15px] font-bold leading-none text-text-primary">{sig.symbol}</div>
                  {sig.order_type && <div className="mt-1 text-[11px] leading-none text-text-muted">{sig.order_type}</div>}
                </div>
                {sig.side && <SideTag side={sig.side} lg />}
              </div>
            )}
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium ${TONE_PILL[status.tone]}`}>
              <StatusIcon size={14} /> {status.label}
            </span>
          </div>
        </div>

        {/* Audit strip */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border bg-bg/30 px-5 py-2.5 text-[11.5px] text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Hash size={12} /> Signal ID <span className="num text-text-secondary">{id.slice(0, 8).toUpperCase()}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Cpu size={12} /> Parsed by <span className="text-text-secondary">{modelLabel(sig.model_used)}</span>
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-primary-light" /> Full audit trail
          </span>
        </div>
      </div>

      {/* Audit trail */}
      <div className="anim-fade mt-6">
        {/* STEP 1 — Original message */}
        <Step n="1" title="Original message" icon={MessageSquareText} tone="teal">
          <div className="border-b border-border px-4 py-2 sm:px-5">
            <div className="flex items-center gap-2 text-[11px] text-text-muted">
              <MessageSquareText size={12} />
              Captured verbatim from the Telegram channel
            </div>
          </div>
          <div className="px-4 py-4 sm:px-5">
            <div className="flex gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-primary-light">
                <Send size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="relative max-w-[420px]">
                  <div className="tg-tail relative rounded-2xl rounded-bl-md bg-surface-elevated px-3.5 py-3">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span className="text-[12.5px] font-semibold text-primary-light">{channelTitle}</span>
                      <BadgeCheck size={13} className="text-primary-light" />
                    </div>
                    <pre className="num whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text-primary">
                      {sig.raw_text ?? "(media message — parsed with the vision model)"}
                    </pre>
                    <div className="num mt-1.5 flex items-center justify-end gap-1 text-[10.5px] text-text-muted">
                      {fmtTime(sig.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Step>

        {/* STEP 2 — Parsed by VouchFX */}
        <Step
          n="2"
          title="Parsed by VouchFX"
          icon={ScanLine}
          tone="teal"
          badge={
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_PILL.teal}`}>
              <Cpu size={12} /> {modelLabel(sig.model_used)}
            </span>
          }
        >
          <div className="grid gap-4 p-4 sm:grid-cols-[1.5fr_1fr] sm:p-5">
            {/* Fields */}
            <div className="overflow-hidden rounded-xl border border-border">
              {parsedFields.map(([k, v, missing], i, arr) => (
                <div
                  key={k}
                  className={`flex items-center justify-between px-3.5 py-2.5 ${i < arr.length - 1 ? "border-b border-border/60" : ""} ${i % 2 ? "bg-bg/30" : "bg-surface"}`}
                >
                  <span className="text-[12.5px] text-text-secondary">{k}</span>
                  <span className={`num text-[12.5px] font-semibold ${missing ? "text-warning" : "text-text-primary"}`}>
                    {missing && <TriangleAlert size={12} className="mr-1 inline -translate-y-px" />}
                    {v}
                  </span>
                </div>
              ))}
            </div>
            {/* Confidence + model */}
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-border bg-bg/40 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Parse confidence</span>
                  <span className="num text-[15px] font-bold text-primary-light">{sig.confidence.toFixed(2)}</span>
                </div>
                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light transition-all"
                    style={{ width: `${Math.round(sig.confidence * 100)}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-text-muted">
                  <span>{sig.confidence >= 0.95 ? "High — fields unambiguous" : sig.confidence >= CONFIDENCE_THRESHOLD ? "Good — fields clear" : "Low — below threshold"}</span>
                  <span className="num">{Math.round(sig.confidence * 100)}%</span>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-bg/40 p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                  <Cpu size={12} /> Model
                </div>
                <div className="mt-1.5 text-[13.5px] font-semibold text-text-primary">{modelLabel(sig.model_used)}</div>
                <div className="mt-0.5 text-[11.5px] text-text-muted">Structured extraction · text + vision</div>
              </div>
            </div>
          </div>
        </Step>

        {/* STEP 3 — Reasoning */}
        <Step n="3" title="VouchFX's reasoning" icon={Brain} tone={skipped ? "warn" : "teal"}>
          <div className="p-4 sm:p-5">
            <div className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary-light">
                <Sparkles size={14} />
              </span>
              <p className="text-[13.5px] leading-relaxed text-text-secondary">
                {sig.reasoning || "No reasoning recorded."}
              </p>
            </div>
          </div>
        </Step>

        {/* STEP 4 — Validation & risk checks */}
        <Step
          n="4"
          title="Validation & risk checks"
          icon={ListChecks}
          tone={allOk ? "profit" : "warn"}
          badge={
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${allOk ? TONE_PILL.profit : TONE_PILL.warn}`}>
              {allOk ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />} {checksPassed}/{checks.length} passed
            </span>
          }
        >
          <div>
            {checks.map(([label, detail, ok], i) => (
              <CheckRow key={label} label={label} detail={detail} ok={ok} last={i === checks.length - 1} />
            ))}
          </div>
        </Step>

        {/* STEP 5 — Action sent to broker */}
        {placed ? (
          <Step
            n="5"
            title="Action sent to broker"
            icon={Send}
            tone="teal"
            badge={
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_PILL.teal}`}>
                MT5
              </span>
            }
          >
            <div className="p-4 sm:p-5">
              <div className="overflow-hidden rounded-xl border border-border bg-bg/40">
                <div className="flex items-center justify-between border-b border-border bg-surface-elevated/40 px-4 py-2.5">
                  <span className="num text-[11px] font-semibold uppercase tracking-wide text-text-muted">Order ticket</span>
                  <div className="flex items-center gap-2">
                    <span className="num text-[13px] font-bold text-text-primary">{sig.symbol}</span>
                    {sig.side && <SideTag side={sig.side} />}
                  </div>
                </div>
                {/* Totals */}
                <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
                  {([
                    ["Total volume", `${totalLots.toFixed(2)} lots`],
                    ["Risk applied", riskApplied],
                    ["Stop loss", fmtPrice(placedLegs[0]?.sl ?? sig.sl)],
                  ] as [string, string][]).map(([k, v], i) => (
                    <div key={k} className="px-3 py-2.5">
                      <div className="text-[10px] uppercase tracking-wide text-text-muted">{k}</div>
                      <div className={`num mt-0.5 text-[13px] font-bold ${i === 1 ? "text-primary-light" : "text-text-primary"}`}>{v}</div>
                    </div>
                  ))}
                </div>
                {/* Split legs */}
                <div className="px-4 py-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">
                    <Split size={12} /> Position split across take-profits
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {placedLegs.map((t, i) => (
                      <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border/70 bg-surface px-3 py-2">
                        <span className="text-[12px] text-text-secondary">
                          Leg {i + 1} → TP{i + 1}
                          {t.is_simulated && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                              <FlaskConical size={9} /> Demo
                            </span>
                          )}
                        </span>
                        <span className="num ml-auto text-[12px] text-text-primary">{t.volume.toFixed(2)} lots</span>
                        <ArrowRight size={12} className="text-text-muted" />
                        <span className="num text-[12px] font-semibold text-primary-light">{fmtPrice(t.tp)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Broker response */}
              {fillPrice != null && (
                <div className="mt-3 flex flex-col gap-2 rounded-xl border border-profit/25 bg-profit/[0.06] p-3.5 sm:flex-row sm:items-center">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-profit/30 bg-profit/10 text-profit">
                    <CircleCheck size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-text-primary">Broker confirmed</div>
                    <div className="num mt-0.5 text-[12.5px] text-text-secondary">
                      Filled at <span className="text-profit">{fmtPrice(fillPrice)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Step>
        ) : (
          <Step
            n="5"
            title="Action sent to broker"
            icon={Send}
            tone="warn"
            badge={
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_PILL.warn}`}>
                <Ban size={12} /> No order placed
              </span>
            }
          >
            <div className="flex items-start gap-3 p-4 sm:p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-warning/30 bg-warning/10 text-warning">
                <CircleSlash size={18} />
              </span>
              <div>
                <div className="text-[13.5px] font-semibold text-text-primary">Nothing was sent to your broker</div>
                <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
                  {skipped
                    ? <>The signal failed a required risk check, so VouchFX placed <span className="font-semibold text-text-primary">no order</span>. Your account was never exposed and no capital was committed.</>
                    : "No trade has been placed for this signal yet."}
                </p>
              </div>
            </div>
          </Step>
        )}

        {/* STEP 6 — Outcome */}
        {skipped ? (
          <Step
            n="6"
            title="Live outcome"
            icon={Activity}
            tone="warn"
            last
            badge={
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_PILL.warn}`}>
                <MinusCircle size={12} /> No position
              </span>
            }
          >
            <div className="p-4 sm:p-5">
              <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/[0.06] p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-warning/30 bg-warning/10 text-warning">
                  <ShieldX size={18} />
                </span>
                <div>
                  <div className="text-[13.5px] font-semibold text-text-primary">Skipped — {skipReason}</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
                    No trade was opened, so there is no profit or loss to track. You can adjust your policy in Risk settings.
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <Link
                  href="/risk"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-elevated px-3.5 py-2 text-[13px] font-semibold text-text-primary transition-colors hover:border-text-muted"
                >
                  <SlidersHorizontal size={14} /> Edit risk policy
                </Link>
              </div>
            </div>
          </Step>
        ) : (
          <Step
            n="6"
            title="Live outcome"
            icon={Activity}
            tone={status.label === "Executed" ? "profit" : "teal"}
            last
            badge={
              status.label === "Executed" ? (
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_PILL.profit}`}>
                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-profit" /> Live
                </span>
              ) : undefined
            }
          >
            <div className="p-4 sm:p-5">
              {/* Lots summary */}
              {placed && (
                <div className="mb-4 grid grid-cols-2 gap-2.5 sm:w-[260px]">
                  <div className="rounded-lg border border-border bg-surface-elevated/40 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-text-muted">Open</div>
                    <div className="num mt-0.5 text-[13px] font-bold text-text-primary">{lotsOpen.toFixed(2)} lots</div>
                  </div>
                  <div className="rounded-lg border border-border bg-surface-elevated/40 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-text-muted">Closed</div>
                    <div className="num mt-0.5 text-[13px] font-bold text-text-primary">{lotsClosed.toFixed(2)} lots</div>
                  </div>
                </div>
              )}

              {/* Event timeline */}
              <div className="mb-2.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">
                <Milestone size={12} /> Event timeline
              </div>
              {auditEvents.length === 0 ? (
                <p className="text-[13px] text-text-muted">No events recorded yet.</p>
              ) : (
                <div className="relative">
                  <div className="absolute bottom-2 left-[11px] top-2 w-px bg-border" />
                  <div className="flex flex-col gap-0.5">
                    {auditEvents.map((e) => {
                      const [EvIcon, tone] = timelineTone[e.event_type] ?? [Clock, "teal" as Tone];
                      return (
                        <div key={e.id} className="relative flex items-start gap-3 py-1.5">
                          <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${TONE_RING[tone]} ${TONE_TEXT[tone]}`}>
                            <EvIcon size={12} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[13px] font-semibold text-text-primary">{eventTitle(e)}</span>
                              <span className="num shrink-0 text-[11px] text-text-muted">{fmtTime(e.created_at)}</span>
                            </div>
                            <div className="num mt-0.5 text-[11.5px] text-text-secondary">{eventDetail(e)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </Step>
        )}
      </div>

      {/* Footer note */}
      <div className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-[12px] text-text-muted">
        <Lock size={13} className="text-primary-light" />
        This record is immutable — VouchFX logs every decision so you can verify it later.
      </div>
    </div>
  );
}
