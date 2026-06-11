import { CheckCircle, XCircle, AlertCircle, TrendingUp, Edit, X, Minus } from "lucide-react";

interface AuditEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface Props {
  events: AuditEvent[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function EventIcon({ type }: { type: string }) {
  switch (type) {
    case "executed":
      return <TrendingUp size={14} className="text-profit" />;
    case "skipped":
      return <Minus size={14} className="text-text-muted" />;
    case "cancelled":
      return <X size={14} className="text-warning" />;
    case "closed":
      return <CheckCircle size={14} className="text-profit" />;
    case "modified":
      return <Edit size={14} className="text-primary" />;
    case "error":
      return <AlertCircle size={14} className="text-loss" />;
    default:
      return <XCircle size={14} className="text-text-muted" />;
  }
}

function eventSummary(event: AuditEvent): string {
  const p = event.payload ?? {};
  switch (event.event_type) {
    case "executed": {
      const sym = p.symbol as string | undefined;
      const side = p.side as string | undefined;
      const legs = p.legs as number | undefined;
      return sym && side
        ? `${side} ${sym}${legs && legs > 1 ? ` (${legs} TPs)` : ""}`
        : "Signal executed";
    }
    case "skipped":
      return `Skipped — ${String(p.reason ?? "unknown").replace(/_/g, " ")}`;
    case "cancelled":
      return `Cancelled${p.legs ? ` (${p.legs} leg${Number(p.legs) > 1 ? "s" : ""})` : ""}`;
    case "closed":
      return p.reason === "drawdown_cap_close_all" ? "Closed all (drawdown cap)" : "Position closed";
    case "modified":
      return (p.action as string | undefined) === "breakeven_applied"
        ? "Moved to breakeven"
        : "Order modified";
    case "error":
      return `Error — ${String(p.error ?? "unknown").slice(0, 60)}`;
    default:
      return event.event_type;
  }
}

export default function ActivityFeed({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-text-muted">No activity yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {events.map((event, i) => (
        <div key={event.id} className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0">
          <div className="mt-0.5 flex-shrink-0">
            <EventIcon type={event.event_type} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text-primary truncate">{eventSummary(event)}</p>
            <p className="text-xs text-text-muted mt-0.5">{timeAgo(event.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
