import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Zap,
  ShieldCheck,
  FileText,
  BarChart2,
  MessageSquare,
  FlaskConical,
} from "lucide-react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  return { title: `Signal · ${(await params).id.slice(0, 8)}` };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtPrice(n: number | null | undefined, decimals = 5) {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function confidenceBar(v: number) {
  const pct = Math.round(v * 100);
  const color = pct >= 85 ? "bg-profit" : pct >= 70 ? "bg-warning" : "bg-loss";
  return { pct, color };
}

function modelLabel(id: string | null) {
  if (!id) return "—";
  if (id.includes("haiku")) return "Claude Haiku (fast)";
  if (id.includes("sonnet")) return "Claude Sonnet (standard)";
  if (id.includes("opus")) return "Claude Opus (advanced)";
  return id;
}

function tradeStatusColor(status: string) {
  return {
    OPEN:      "text-profit",
    PENDING:   "text-warning",
    CLOSED:    "text-text-secondary",
    CANCELLED: "text-text-muted",
    SKIPPED:   "text-text-muted",
  }[status] ?? "text-text-muted";
}

// ── Event timeline entry ──────────────────────────────────────────────────────

type AuditEvent = {
  id: string;
  event_type: string;
  trade_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

function TimelineStep({ event, isLast }: { event: AuditEvent; isLast: boolean }) {
  const iconMap: Record<string, React.ReactNode> = {
    received: <Clock size={14} className="text-text-muted" />,
    parsed:   <BarChart2 size={14} className="text-primary" />,
    executed: <CheckCircle2 size={14} className="text-profit" />,
    skipped:  <XCircle size={14} className="text-warning" />,
    cancelled:<XCircle size={14} className="text-text-muted" />,
    closed:   <CheckCircle2 size={14} className="text-text-secondary" />,
    modified: <Zap size={14} className="text-primary" />,
    error:    <AlertTriangle size={14} className="text-loss" />,
  };

  const p = event.payload ?? {};

  function renderPayloadDetail() {
    switch (event.event_type) {
      case "received":
        return (
          <p className="text-xs text-text-muted">
            Message #{p.message_id as number | undefined} · edit v{p.edit_version as number | undefined ?? 0}
          </p>
        );
      case "parsed": {
        const pSym = p.symbol as string | undefined;
        const pSide = p.side as string | undefined;
        const pFut = p.follow_up_type as string | undefined;
        return (
          <div className="space-y-1">
            {(pSym || pSide) && (
              <p className="text-xs text-text-secondary">
                Parsed: {String(pSide ?? "")} {String(pSym ?? "")} — confidence {typeof p.confidence === "number" ? `${Math.round(p.confidence * 100)}%` : "—"}
              </p>
            )}
            {pFut && pFut !== "NEW_SIGNAL" && (
              <p className="text-xs text-text-secondary">Follow-up: {pFut}</p>
            )}
            <p className="text-xs text-text-muted">
              Model: {modelLabel(p.model as string | null)} {p.escalated ? "· escalated" : ""}
              {p.vision ? " · vision" : ""}
            </p>
          </div>
        );
      }
      case "skipped":
        return (
          <p className="text-xs text-warning">
            Reason: {String(p.reason ?? "unknown").replace(/_/g, " ")}
          </p>
        );
      case "executed":
        return (
          <div className="space-y-1">
            <p className="text-xs text-text-secondary">
              {String(p.side ?? "")} {String(p.symbol ?? "")} · {p.legs as number | undefined ?? 1} leg{(p.legs as number | undefined ?? 1) > 1 ? "s" : ""} · vol {p.volume as number | undefined ?? "—"}
            </p>
            {typeof p.dollar_risk === "number" && (
              <p className="text-xs text-text-muted">
                Risk: ${(p.dollar_risk as number).toFixed(2)} · Balance: ${(p.account_balance as number | undefined ?? 0).toFixed(2)}
              </p>
            )}
          </div>
        );
      case "modified":
        return (
          <p className="text-xs text-text-secondary">
            {p.action === "breakeven_applied"
              ? `Breakeven applied → SL ${p.entry_price}`
              : p.follow_up_type
              ? `${String(p.follow_up_type).replace(/_/g, " ")}`
              : "Order modified"}
          </p>
        );
      case "cancelled":
        return (
          <p className="text-xs text-text-muted">
            {p.source === "telegram_delete" ? "Cancelled by Telegram message delete" : `${p.cancelled as number | undefined ?? 0} cancelled, ${p.closed as number | undefined ?? 0} closed`}
          </p>
        );
      case "closed":
        return (
          <p className="text-xs text-text-secondary">
            {p.reason === "drawdown_cap_close_all" ? "Closed by drawdown guardian" : `${p.legs as number | undefined ?? 1} position(s) closed`}
          </p>
        );
      case "error":
        return (
          <p className="text-xs text-loss truncate max-w-md">
            {String(p.error ?? "unknown error")}
          </p>
        );
      default:
        return null;
    }
  }

  return (
    <div className="flex gap-4">
      {/* Timeline spine */}
      <div className="flex flex-col items-center">
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface-elevated flex-shrink-0">
          {iconMap[event.event_type] ?? <Clock size={14} className="text-text-muted" />}
        </div>
        {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
      </div>
      {/* Content */}
      <div className="pb-6 min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-text-primary capitalize">{event.event_type}</span>
          <span className="text-xs text-text-muted">{fmt(event.created_at)}</span>
          {event.trade_id && (
            <span className="text-2xs text-text-muted font-mono">trade:{event.trade_id.slice(0, 8)}</span>
          )}
        </div>
        {renderPayloadDetail()}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

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

  const [{ data: signal }, { data: trades }, { data: events }] =
    await Promise.all([
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

  // Fetch source title
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

  const { pct: confPct, color: confColor } = confidenceBar(sig.confidence);

  const overallStatus = (() => {
    if (tradeRows.some((t) => t.status === "OPEN")) return { label: "Open", cls: "text-profit" };
    if (tradeRows.some((t) => t.status === "PENDING")) return { label: "Pending", cls: "text-warning" };
    if (tradeRows.some((t) => t.status === "CLOSED")) return { label: "Closed", cls: "text-text-secondary" };
    if (tradeRows.length > 0) return { label: "Settled", cls: "text-text-muted" };
    const skippedEvent = auditEvents.find((e) => e.event_type === "skipped");
    if (skippedEvent) return { label: "Skipped", cls: "text-warning" };
    return { label: "Received", cls: "text-text-muted" };
  })();

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back + header */}
      <div>
        <Link
          href="/signals"
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors mb-4"
        >
          <ArrowLeft size={14} /> Back to signals
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              {sig.side === "BUY" ? (
                <TrendingUp size={20} className="text-profit" />
              ) : sig.side === "SELL" ? (
                <TrendingDown size={20} className="text-loss" />
              ) : null}
              <h1 className="num text-2xl font-bold text-text-primary">
                {sig.symbol ?? "Follow-up"}
              </h1>
              {sig.side && (
                <span className={`text-sm font-semibold ${sig.side === "BUY" ? "text-profit" : "text-loss"}`}>
                  {sig.side}
                </span>
              )}
              <span className={`text-sm font-medium ${overallStatus.cls}`}>
                · {overallStatus.label}
              </span>
            </div>
            <p className="text-sm text-text-secondary mt-1">
              {fmt(sig.created_at)}
              {sourceRow?.title && (
                <> · <span className="text-text-muted">{sourceRow.title as string}</span></>
              )}
            </p>
          </div>
          <span className="font-mono text-xs text-text-muted bg-surface-elevated px-2 py-1 rounded">
            {id.slice(0, 8)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Left column — 3/5 */}
        <div className="lg:col-span-3 space-y-4">

          {/* Parsed fields */}
          <div className="card p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <BarChart2 size={15} className="text-primary" />
              Parsed fields
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
              <Field label="Symbol" value={sig.symbol ?? "—"} mono />
              <Field label="Side" value={sig.side ?? "—"} color={sig.side === "BUY" ? "text-profit" : sig.side === "SELL" ? "text-loss" : undefined} />
              <Field label="Order type" value={sig.order_type ?? "MARKET"} />
              <Field label="Follow-up" value={sig.follow_up_type ?? "NEW_SIGNAL"} />
              <Field
                label={`Entry${sig.entries.length > 1 ? " range" : ""}`}
                value={sig.entries.length > 0 ? sig.entries.map((e) => fmtPrice(e)).join(" – ") : "—"}
                mono
              />
              <Field
                label={`SL${sig.sl_unit ? ` (${sig.sl_unit})` : ""}`}
                value={fmtPrice(sig.sl)}
                mono
                color="text-loss"
              />
              {sig.tps.length > 0 && (
                <div className="col-span-2">
                  <p className="text-xs text-text-secondary mb-1">
                    TPs{sig.tp_unit ? ` (${sig.tp_unit})` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sig.tps.map((tp, i) => (
                      <span key={i} className="num rounded bg-surface-elevated px-2 py-0.5 text-xs font-medium text-profit tabular-nums">
                        TP{i + 1}: {fmtPrice(tp)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <Field label="Language" value={sig.language_detected.toUpperCase()} />
            </div>

            {/* Confidence bar */}
            <div className="pt-1 border-t border-border space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">Confidence</span>
                <span className={`num text-sm font-bold tabular-nums ${confColor === "bg-profit" ? "text-profit" : confColor === "bg-warning" ? "text-warning" : "text-loss"}`}>
                  {confPct}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                <div
                  className={`h-full rounded-full ${confColor} transition-all`}
                  style={{ width: `${confPct}%` }}
                />
              </div>
              <p className="text-xs text-text-muted">
                Model: {modelLabel(sig.model_used)}
              </p>
            </div>
          </div>

          {/* Reasoning */}
          <div className="card p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <MessageSquare size={15} className="text-primary" />
              Claude&apos;s reasoning
            </div>
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
              {sig.reasoning || "No reasoning provided."}
            </p>
          </div>

          {/* Raw message */}
          {sig.raw_text && (
            <details className="card">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-text-primary hover:bg-surface-elevated/40 transition-colors rounded-xl">
                <FileText size={15} className="text-text-muted" />
                Raw message
              </summary>
              <div className="border-t border-border px-4 py-3">
                <p className="whitespace-pre-wrap font-mono text-xs text-text-secondary leading-relaxed">
                  {sig.raw_text}
                </p>
              </div>
            </details>
          )}
        </div>

        {/* Right column — 2/5 */}
        <div className="lg:col-span-2 space-y-4">

          {/* Trade legs */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <ShieldCheck size={15} className="text-primary" />
              Trade legs
              <span className="ml-auto text-xs text-text-muted">{tradeRows.length}</span>
            </div>

            {tradeRows.length === 0 ? (
              <p className="text-sm text-text-muted">No trades placed.</p>
            ) : (
              <div className="space-y-2">
                {tradeRows.map((t, i) => (
                  <div key={t.id} className="rounded-lg border border-border bg-surface-elevated/40 px-3 py-2.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-text-secondary">Leg {i + 1}</span>
                        {t.is_simulated && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-1.5 py-0.5 text-2xs font-medium text-warning border border-warning/20">
                            <FlaskConical size={9} /> Simulated
                          </span>
                        )}
                      </div>
                      <span className={`text-xs font-semibold ${tradeStatusColor(t.status)}`}>
                        {t.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <MiniField label="Vol" value={String(t.volume)} />
                      <MiniField label="Entry" value={fmtPrice(t.entry_price)} />
                      <MiniField label="SL" value={fmtPrice(t.sl)} />
                      <MiniField label="TP" value={fmtPrice(t.tp)} />
                    </div>
                    {t.opened_at && (
                      <p className="text-2xs text-text-muted">
                        Opened {fmt(t.opened_at)}
                        {t.closed_at && ` · Closed ${fmt(t.closed_at)}`}
                      </p>
                    )}
                    {t.skip_reason && (
                      <p className="text-2xs text-warning truncate">↳ {t.skip_reason}</p>
                    )}
                    {t.breakeven_applied && (
                      <p className="text-2xs text-primary">↳ Breakeven applied</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Risk gate summary */}
          {(() => {
            const gateEvents = auditEvents.filter((e) => e.event_type === "skipped");
            if (gateEvents.length === 0) return null;
            return (
              <div className="card p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                  <AlertTriangle size={15} className="text-warning" />
                  Skipped — reason
                </div>
                {gateEvents.map((e) => (
                  <p key={e.id} className="text-sm text-warning">
                    {String((e.payload ?? {}).reason ?? "unknown").replace(/_/g, " ")}
                  </p>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Full audit timeline */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-text-primary">Full audit timeline</h2>
        <div className="card px-4 pt-4 pb-0">
          {auditEvents.length === 0 ? (
            <p className="pb-4 text-sm text-text-muted">No events recorded.</p>
          ) : (
            auditEvents.map((event, i) => (
              <TimelineStep
                key={event.id}
                event={event}
                isLast={i === auditEvents.length - 1}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Small field renderers ─────────────────────────────────────────────────────

function Field({
  label,
  value,
  mono,
  color,
}: {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
}) {
  return (
    <div>
      <p className="text-xs text-text-secondary mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${mono ? "font-mono tabular-nums" : ""} ${color ?? "text-text-primary"}`}>
        {value}
      </p>
    </div>
  );
}

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-text-muted">{label}</span>
      <span className="num font-medium text-text-secondary tabular-nums">{value}</span>
    </div>
  );
}
