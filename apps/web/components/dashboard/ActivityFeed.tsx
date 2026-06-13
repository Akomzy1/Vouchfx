import Link from "next/link";
import {
  CircleCheck,
  ShieldCheck,
  Target,
  TriangleAlert,
  X,
  Pencil,
  ChevronRight,
  Send,
} from "lucide-react";

interface AuditEvent {
  id: string;
  event_type: string;
  parsed_signal_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface Props {
  events: AuditEvent[];
}

type Tone = "profit" | "teal" | "warn" | "loss" | "muted";

const TONE_TEXT: Record<Tone, string> = {
  profit: "text-profit",
  teal: "text-primary-light",
  warn: "text-warning",
  loss: "text-loss",
  muted: "text-text-muted",
};
const TONE_BG: Record<Tone, string> = {
  profit: "bg-profit/10 border-profit/25",
  teal: "bg-primary/10 border-primary/25",
  warn: "bg-warning/10 border-warning/25",
  loss: "bg-loss/10 border-loss/25",
  muted: "bg-surface-elevated border-border",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function describe(event: AuditEvent): {
  Icon: React.ElementType;
  tone: Tone;
  title: string;
  detail: string;
} {
  const p = event.payload ?? {};
  const sym = (p.symbol as string | undefined) ?? "";
  const side = (p.side as string | undefined) ?? "";

  switch (event.event_type) {
    case "executed":
      return {
        Icon: CircleCheck,
        tone: "profit",
        title: "Signal executed",
        detail: [sym, side].filter(Boolean).join(" ") || "Trade placed",
      };
    case "modified":
      return (p.action as string | undefined) === "breakeven_applied"
        ? { Icon: ShieldCheck, tone: "teal", title: "SL moved to breakeven", detail: sym || "Order updated" }
        : { Icon: Pencil, tone: "teal", title: "Order modified", detail: sym || "SL/TP updated" };
    case "closed":
      return {
        Icon: Target,
        tone: "profit",
        title: p.reason === "drawdown_cap_close_all" ? "Closed all — drawdown cap" : "Position closed",
        detail: sym || "Closed",
      };
    case "skipped":
      return {
        Icon: TriangleAlert,
        tone: "warn",
        title: "Signal skipped",
        detail: String(p.reason ?? "unknown").replace(/_/g, " "),
      };
    case "cancelled":
      return { Icon: X, tone: "muted", title: "Order cancelled", detail: sym || "Pending order removed" };
    case "error":
      return {
        Icon: TriangleAlert,
        tone: "loss",
        title: "Execution error",
        detail: String(p.error ?? "unknown").slice(0, 60),
      };
    default:
      return { Icon: CircleCheck, tone: "muted", title: event.event_type, detail: "" };
  }
}

export default function ActivityFeed({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-text-muted">No activity yet.</p>
        <p className="text-xs text-text-muted mt-1">
          Connect Telegram and add a channel to start copying signals.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline spine */}
      <div className="absolute bottom-3 left-[26px] top-3 w-px bg-border/70" />
      <div className="flex flex-col">
        {events.map((event) => {
          const { Icon, tone, title, detail } = describe(event);
          const channel = (event.payload?.channel_title as string | undefined) ?? null;
          // Link to the signal's audit trail when this event belongs to one;
          // events with no signal (e.g. ops alerts) fall back to the list.
          const href = event.parsed_signal_id ? `/signals/${event.parsed_signal_id}` : "/signals";
          return (
            <Link
              key={event.id}
              href={href}
              className="group relative flex items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-surface-elevated/50"
            >
              <span
                className={`relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${TONE_BG[tone]} ${TONE_TEXT[tone]}`}
              >
                <Icon size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-text-primary">{title}</span>
                  <span className="num shrink-0 text-[11px] text-text-muted">{timeAgo(event.created_at)}</span>
                </div>
                {detail && (
                  <div className="num mt-0.5 text-[12px] text-text-secondary">{detail}</div>
                )}
                {channel && (
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-text-muted">
                    <Send size={10} /> {channel}
                  </div>
                )}
              </div>
              <ChevronRight
                size={15}
                className="mt-1 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
