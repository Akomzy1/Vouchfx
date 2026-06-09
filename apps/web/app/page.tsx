import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="card p-8 w-full max-w-sm space-y-6 text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2">
          <span className="h-3 w-3 rounded-full bg-primary" />
          <span className="text-2xl font-bold tracking-tight text-text-primary">VouchFX</span>
        </div>

        {/* Tagline */}
        <p className="text-sm text-text-secondary leading-relaxed">
          Your Telegram signals, traded automatically on MT5.
        </p>

        {/* Status */}
        <div className="flex items-center justify-center gap-3">
          <span className="pill pill-connected">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Phase 0 complete
          </span>
        </div>

        {/* Links */}
        <div className="border-t border-border pt-4 space-y-3">
          <Link
            href="/signals"
            className="btn-primary w-full block text-center"
          >
            Signal Monitor →
          </Link>
          <p className="text-xs text-text-muted">
            Live parsed signals, trades, and audit trail
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="mt-6 max-w-sm text-center text-2xs text-text-muted leading-relaxed">
        VouchFX is an execution tool you control. It does not provide financial advice or guarantee
        outcomes. Trading involves risk.
      </p>
    </main>
  );
}
