import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import StatusPill from "@/components/ui/StatusPill";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Signals" };
export const dynamic = "force-dynamic";

type ParsedSignalRow = {
  id: string;
  symbol: string | null;
  signal_side: string | null;
  order_type: string | null;
  confidence: number | null;
  is_signal: boolean | null;
  follow_up_type: string | null;
  created_at: string;
  raw_text: string | null;
};

type TradeRow = {
  id: string;
  parsed_signal_id: string;
  symbol: string;
  status: string;
  entry_price: number | null;
  sl_price: number | null;
  volume: number | null;
  created_at: string;
};

type AuditEventRow = {
  id: string;
  event_type: string;
  created_at: string;
  payload: Record<string, unknown> | null;
};

export default async function SignalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [{ data: signals }, { data: trades }, { data: auditEvents }] = await Promise.all([
    db.from("parsed_signals")
      .select("id, symbol, signal_side, order_type, confidence, is_signal, follow_up_type, created_at, raw_text")
      .order("created_at", { ascending: false })
      .limit(50),
    db.from("trades")
      .select("id, parsed_signal_id, symbol, status, entry_price, sl_price, volume, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    db.from("audit_events")
      .select("id, event_type, created_at, payload")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Signals</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Parsed signals, executed trades, and the full audit trail.
        </p>
      </div>

      {/* Signals */}
      <Section title="Parsed Signals" count={(signals ?? []).length}>
        {(signals ?? []).length === 0 ? (
          <Empty message="No signals parsed yet. Connect Telegram and add a channel." />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Time", "Symbol", "Side", "Type", "Confidence", "Kind"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(signals as ParsedSignalRow[]).map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-surface-elevated">
                    <td className="px-4 py-2.5 text-xs text-text-muted whitespace-nowrap">
                      <Ts value={s.created_at} />
                    </td>
                    <td className="num px-4 py-2.5 font-medium text-text-primary">{s.symbol ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <SideBadge side={s.signal_side} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-text-secondary">{s.order_type ?? "—"}</td>
                    <td className="num px-4 py-2.5 text-text-secondary">
                      {s.confidence != null ? (
                        <ConfidenceBadge value={s.confidence} />
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.is_signal ? (
                        <StatusPill status="live" label="Signal" />
                      ) : (
                        <StatusPill status="pending" label={s.follow_up_type ?? "Follow-up"} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Trades */}
      <Section title="Trades" count={(trades ?? []).length}>
        {(trades ?? []).length === 0 ? (
          <Empty message="No trades placed yet." />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Time", "Symbol", "Status", "Volume", "Entry", "SL"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-secondary whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(trades as TradeRow[]).map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface-elevated">
                    <td className="px-4 py-2.5 text-xs text-text-muted whitespace-nowrap">
                      <Ts value={t.created_at} />
                    </td>
                    <td className="num px-4 py-2.5 font-medium text-text-primary">{t.symbol}</td>
                    <td className="px-4 py-2.5">
                      <TradeStatusPill status={t.status} />
                    </td>
                    <td className="num px-4 py-2.5 text-text-secondary">{t.volume ?? "—"}</td>
                    <td className="num px-4 py-2.5 text-text-secondary">{t.entry_price ?? "—"}</td>
                    <td className="num px-4 py-2.5 text-text-secondary">{t.sl_price ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Audit log */}
      <Section title="Audit Log" count={(auditEvents ?? []).length}>
        {(auditEvents ?? []).length === 0 ? (
          <Empty message="No audit events yet." />
        ) : (
          <div className="card divide-y divide-border">
            {(auditEvents as AuditEventRow[]).map((e) => (
              <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                <AuditTypePill type={e.event_type} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-muted truncate">
                    {e.payload ? JSON.stringify(e.payload).slice(0, 120) : "—"}
                  </p>
                </div>
                <p className="text-xs text-text-muted whitespace-nowrap shrink-0">
                  <Ts value={e.created_at} />
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="card p-8 text-center">
      <p className="text-sm text-text-muted">{message}</p>
    </div>
  );
}

function Ts({ value }: { value: string }) {
  const d = new Date(value);
  return (
    <span title={d.toISOString()}>
      {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{" "}
      <span className="text-text-muted">
        {d.toLocaleDateString([], { month: "short", day: "numeric" })}
      </span>
    </span>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 85 ? "text-profit" : pct >= 70 ? "text-warning" : "text-loss";
  return <span className={`font-medium ${color}`}>{pct}%</span>;
}

function SideBadge({ side }: { side: string | null }) {
  if (!side) return <span className="text-text-muted">—</span>;
  const color = side === "BUY" ? "text-profit" : side === "SELL" ? "text-loss" : "text-text-muted";
  return <span className={`text-xs font-semibold ${color}`}>{side}</span>;
}

function TradeStatusPill({ status }: { status: string }) {
  const map: Record<string, { pill: string; dot: string }> = {
    OPEN:      { pill: "pill-connected", dot: "bg-profit" },
    PENDING:   { pill: "pill-paused",    dot: "bg-warning" },
    CLOSED:    { pill: "pill-error",     dot: "bg-text-muted" },
    CANCELLED: { pill: "pill-error",     dot: "bg-text-muted" },
    SKIPPED:   { pill: "pill-paused",    dot: "bg-text-muted" },
    ERROR:     { pill: "pill-error",     dot: "bg-loss" },
  };
  const style = map[status] ?? { pill: "pill-paused", dot: "bg-text-muted" };
  return (
    <span className={`pill ${style.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}

function AuditTypePill({ type }: { type: string }) {
  const colors: Record<string, string> = {
    received: "text-text-secondary bg-surface-elevated",
    parsed:   "text-primary bg-teal-900/20",
    executed: "text-profit bg-green-900/20",
    skipped:  "text-warning bg-amber-900/20",
    error:    "text-loss bg-red-900/20",
    cancelled:"text-text-muted bg-surface-elevated",
    modified: "text-primary bg-teal-900/20",
  };
  const cls = colors[type] ?? "text-text-secondary bg-surface-elevated";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {type}
    </span>
  );
}
