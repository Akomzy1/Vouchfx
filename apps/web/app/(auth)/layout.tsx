import Link from "next/link";
import Mark from "@/components/marketing/Mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand lockup (horizontal, primary — see brand guidelines) */}
        <Link href="/" className="flex items-center justify-center gap-2.5 mb-2">
          <Mark size={28} />
          <span className="text-2xl font-extrabold tracking-tight text-text-primary">
            Vouch<span className="text-primary">FX</span>
          </span>
        </Link>
        {children}
        <p className="text-center text-2xs text-text-muted leading-relaxed px-2">
          VouchFX is an execution tool you control. It does not provide financial advice or
          guarantee outcomes. Trading involves risk.
        </p>
      </div>
    </div>
  );
}
