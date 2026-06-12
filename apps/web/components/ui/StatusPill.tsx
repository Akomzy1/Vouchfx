type Status = "live" | "connected" | "paused" | "disconnected" | "error" | "pending";

interface StatusPillProps {
  status: Status;
  label?: string;
}

const STYLES: Record<Status, { pill: string; dot: string; defaultLabel: string }> = {
  live:          { pill: "pill-connected", dot: "bg-profit",   defaultLabel: "Live" },
  connected:     { pill: "pill-connected", dot: "bg-profit",   defaultLabel: "Connected" },
  paused:        { pill: "pill-paused",    dot: "bg-warning",  defaultLabel: "Paused" },
  disconnected:  { pill: "pill-error",     dot: "bg-loss",     defaultLabel: "Disconnected" },
  error:         { pill: "pill-error",     dot: "bg-loss",     defaultLabel: "Error" },
  pending:       { pill: "pill-paused",    dot: "bg-warning",  defaultLabel: "Pending" },
};

export default function StatusPill({ status, label }: StatusPillProps) {
  const { pill, dot, defaultLabel } = STYLES[status];
  return (
    <span className={`pill ${pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label ?? defaultLabel}
    </span>
  );
}
