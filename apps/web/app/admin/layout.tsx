import { requireStaffPage } from "@/lib/auth/admin";
import Link from "next/link";
import { Banknote, Users, Activity, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin/payouts", label: "Payouts", Icon: Banknote },
  { href: "/admin/users", label: "Users", Icon: Users },
  { href: "/admin/health", label: "Ops health", Icon: Activity },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Shell gate: any staff (admin OR rule_approver) so prop-approval access is
  // preserved. Admin-only sections additionally call requireAdminPage().
  await requireStaffPage();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheck size={18} className="text-primary" />
        <h1 className="text-lg font-semibold text-text-primary">Admin console</h1>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-primary-light">
          Staff only
        </span>
      </div>

      <nav className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {NAV.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
          >
            <Icon size={14} /> {label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
