export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Wordmark */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="h-3 w-3 rounded-full bg-primary" />
          <span className="text-2xl font-bold tracking-tight text-text-primary">VouchFX</span>
        </div>
        {children}
        <p className="text-center text-2xs text-text-muted leading-relaxed px-2">
          VouchFX is an execution tool you control. It does not provide financial advice or
          guarantee outcomes. Trading involves risk.
        </p>
      </div>
    </div>
  );
}
