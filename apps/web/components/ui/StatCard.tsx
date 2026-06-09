interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaPositive?: boolean;
  sub?: string;
}

export default function StatCard({ label, value, delta, deltaPositive, sub }: StatCardProps) {
  return (
    <div className="card p-4 space-y-1">
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">{label}</p>
      <p className="num text-2xl font-bold text-text-primary tabular-nums">{value}</p>
      {delta && (
        <p
          className={`num text-xs font-medium tabular-nums ${
            deltaPositive ? "text-profit" : "text-loss"
          }`}
        >
          {delta}
        </p>
      )}
      {sub && <p className="text-xs text-text-muted">{sub}</p>}
    </div>
  );
}
