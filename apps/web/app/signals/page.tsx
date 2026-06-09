/**
 * Phase 0 signal monitor — spike dashboard.
 *
 * Server component: reads parsed_signals, trades, and audit_events from Supabase
 * using the service-role client. No auth yet (P1.1 adds auth + RLS).
 *
 * Design tokens: VouchFX dark fintech — bg #0B0F14, surface #151B23, teal accent.
 * Numbers rendered in monospace tabular figures per design system.
 */

import { createAdminClientFromEnv } from "@vouchfx/db";
import { parseEnv } from "@vouchfx/config";
import type { ParsedSignalRow, TradeRow, AuditEventRow } from "@vouchfx/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Signal Monitor" };

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchData(): Promise<{
  signals: ParsedSignalRow[];
  trades: TradeRow[];
  events: AuditEventRow[];
} | null> {
  let env;
  try {
    env = parseEnv();
  } catch {
    return null;
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;

  const db = createAdminClientFromEnv(env);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: signals }, { data: trades }, { data: events }] = await Promise.all([
    (db as any).from("parsed_signals").select("*").order("parsed_at", { ascending: false }).limit(50),
    (db as any).from("trades").select("*").order("created_at", { ascending: false }).limit(100),
    (db as any).from("audit_events").select("*").order("created_at", { ascending: false }).limit(200),
  ]);

  return {
    signals: (signals ?? []) as ParsedSignalRow[],
    trades: (trades ?? []) as TradeRow[],
    events: (events ?? []) as AuditEventRow[],
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.85 ? "text-primary" : value >= 0.7 ? "text-warning" : "text-loss";
  return <span className={`font-mono tabular-nums text-xs ${color}`}>{pct}%</span>;
}

function StatusPill({ status }: { status: string }) {
  const variants: Record<string, string> = {
    OPEN: "pill-connected",
    PENDING: "text-warning bg-amber-900/30 border border-amber-700/40 pill",
    CLOSED: "text-text-muted bg-surface-elevated border border-border pill",
    CANCELLED: "text-text-muted bg-surface-elevated border border-border pill",
    SKIPPED: "pill-error",
  };
  return (
    <span className={variants[status] ?? "pill text-text-secondary border border-border bg-surface"}>
      {status}
    </span>
  );
}

function SideBadge({ side }: { side: string | null }) {
  if (!side) return <span className="text-text-muted">—</span>;
  return (
    <span className={side === "BUY" ? "text-profit font-mono font-semibold" : "text-loss font-mono font-semibold"}>
      {side}
    </span>
  );
}

function Short({ id }: { id: string | null }) {
  if (!id) return <span className="text-text-muted">—</span>;
  return <span className="font-mono text-xs text-text-secondary">{id.slice(0, 8)}…</span>;
}

function Ts({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-text-muted">—</span>;
  const d = new Date(iso);
  return (
    <span className="font-mono text-xs text-text-muted tabular-nums">
      {d.toLocaleDateString()} {d.toLocaleTimeString()}
    </span>
  );
}

function EventTypePill({ type }: { type: string }) {
  const map: Record<string, string> = {
    received: "text-text-secondary border-border",
    parsed: "text-primary border-teal-700/40",
    executed: "text-profit border-green-700/40",
    skipped: "text-warning border-amber-700/40",
    modified: "text-primary border-teal-700/40",
    cancelled: "text-text-muted border-border",
    closed: "text-text-secondary border-border",
    error: "text-loss border-red-700/40",
  };
  const cls = map[type] ?? "text-text-secondary border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-surface-elevated ${cls}`}>
      {type}
    </span>
  );
}

// ── Tables ────────────────────────────────────────────────────────────────────

function SignalsTable({ signals }: { signals: ParsedSignalRow[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Parsed Signals <span className="text-text-muted font-normal normal-case">({signals.length})</span>
      </h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Symbol</th>
              <th className="px-4 py-3">Side</th>
              <th className="px-4 py-3">SL</th>
              <th className="px-4 py-3">TPs</th>
              <th className="px-4 py-3">Confidence</th>
              <th className="px-4 py-3">Follow-up</th>
              <th className="px-4 py-3">Parsed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {signals.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-text-muted">
                  No signals yet — send a message to the monitored Telegram channel.
                </td>
              </tr>
            ) : signals.map((s) => (
              <tr key={s.id} className="hover:bg-surface-elevated transition-colors">
                <td className="px-4 py-3"><Short id={s.id} /></td>
                <td className="px-4 py-3">
                  <span className="font-mono font-semibold text-text-primary">{s.symbol ?? "—"}</span>
                </td>
                <td className="px-4 py-3"><SideBadge side={s.side} /></td>
                <td className="px-4 py-3">
                  <span className="font-mono tabular-nums text-text-primary">
                    {s.sl != null ? Number(s.sl).toFixed(2) : "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono tabular-nums text-text-secondary text-xs">
                    {Array.isArray(s.tps) && s.tps.length > 0
                      ? (s.tps as number[]).map((t) => Number(t).toFixed(2)).join(" / ")
                      : "—"}
                  </span>
                </td>
                <td className="px-4 py-3"><ConfidenceBadge value={Number(s.confidence)} /></td>
                <td className="px-4 py-3">
                  {s.follow_up_type && s.follow_up_type !== "NEW_SIGNAL" ? (
                    <span className="text-xs text-warning">{s.follow_up_type}</span>
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3"><Ts iso={s.parsed_at} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TradesTable({ trades }: { trades: TradeRow[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Trades <span className="text-text-muted font-normal normal-case">({trades.length})</span>
      </h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Symbol</th>
              <th className="px-4 py-3">Side</th>
              <th className="px-4 py-3">Lots</th>
              <th className="px-4 py-3">Entry</th>
              <th className="px-4 py-3">SL</th>
              <th className="px-4 py-3">TP</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Broker ID</th>
              <th className="px-4 py-3">Opened</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {trades.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-text-muted">
                  No trades placed yet.
                </td>
              </tr>
            ) : trades.map((t) => (
              <tr key={t.id} className="hover:bg-surface-elevated transition-colors">
                <td className="px-4 py-3"><Short id={t.id} /></td>
                <td className="px-4 py-3">
                  <span className="font-mono font-semibold text-text-primary">{t.symbol}</span>
                </td>
                <td className="px-4 py-3"><SideBadge side={t.side} /></td>
                <td className="px-4 py-3">
                  <span className="font-mono tabular-nums text-text-primary">{Number(t.volume).toFixed(2)}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono tabular-nums text-text-primary">
                    {t.entry_price != null ? Number(t.entry_price).toFixed(5) : "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono tabular-nums text-text-secondary">
                    {t.sl != null ? Number(t.sl).toFixed(5) : "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono tabular-nums text-text-secondary">
                    {t.tp != null ? Number(t.tp).toFixed(5) : "—"}
                  </span>
                </td>
                <td className="px-4 py-3"><StatusPill status={t.status} /></td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-text-muted">{t.broker_order_id ?? "—"}</span>
                </td>
                <td className="px-4 py-3"><Ts iso={t.opened_at} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AuditTable({ events }: { events: AuditEventRow[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Audit Trail <span className="text-text-muted font-normal normal-case">({events.length} events, newest first)</span>
      </h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Signal</th>
              <th className="px-4 py-3">Trade</th>
              <th className="px-4 py-3">Payload summary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                  No audit events yet.
                </td>
              </tr>
            ) : events.map((e) => {
              const payload = e.payload as Record<string, unknown>;
              const summary = Object.entries(payload)
                .filter(([k]) => k !== "raw_text" && k !== "reasoning")
                .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                .join("  ·  ")
                .slice(0, 120);
              return (
                <tr key={e.id} className="hover:bg-surface-elevated transition-colors">
                  <td className="px-4 py-3"><Ts iso={e.created_at} /></td>
                  <td className="px-4 py-3"><EventTypePill type={e.event_type} /></td>
                  <td className="px-4 py-3"><Short id={e.parsed_signal_id} /></td>
                  <td className="px-4 py-3"><Short id={e.trade_id} /></td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-text-muted">{summary || "—"}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SignalsPage() {
  const data = await fetchData();

  if (!data) {
    return (
      <main className="min-h-screen bg-bg p-8">
        <div className="mx-auto max-w-2xl">
          <div className="card p-8 text-center space-y-3">
            <h1 className="text-xl font-bold text-text-primary">Signal Monitor</h1>
            <p className="text-text-secondary text-sm">
              Supabase is not configured. Set{" "}
              <code className="font-mono text-primary">SUPABASE_URL</code> and{" "}
              <code className="font-mono text-primary">SUPABASE_SERVICE_ROLE_KEY</code> in your{" "}
              <code className="font-mono text-text-secondary">.env</code> file, then restart the dev server.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const { signals, trades, events } = data;

  return (
    <main className="min-h-screen bg-bg">
      {/* Top bar */}
      <header className="border-b border-border bg-surface px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          <span className="font-bold text-text-primary tracking-tight">VouchFX</span>
          <span className="text-text-muted text-sm">/ Signal Monitor</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="pill pill-connected">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Phase 0 spike
          </span>
          <span className="text-text-muted text-xs font-mono">
            {signals.length} signals · {trades.length} trades
          </span>
        </div>
      </header>

      {/* Stat row */}
      <div className="border-b border-border px-6 py-4 flex flex-wrap gap-6">
        {[
          { label: "Total signals", value: signals.length },
          { label: "Executed (OPEN)", value: trades.filter(t => t.status === "OPEN").length },
          { label: "Skipped trades", value: trades.filter(t => t.status === "SKIPPED").length },
          { label: "Audit events", value: events.length },
        ].map(({ label, value }) => (
          <div key={label} className="space-y-0.5">
            <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
            <p className="font-mono text-xl font-bold text-text-primary tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Tables */}
      <div className="mx-auto max-w-[1600px] px-6 py-8 space-y-10">
        <SignalsTable signals={signals} />
        <TradesTable trades={trades} />
        <AuditTable events={events} />
      </div>

      {/* Disclaimer */}
      <footer className="border-t border-border px-6 py-4 text-center text-2xs text-text-muted">
        VouchFX is an execution tool you control. It does not provide financial advice or guarantee outcomes. Trading involves risk.
      </footer>
    </main>
  );
}
