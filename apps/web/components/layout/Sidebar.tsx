"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Send,
  Zap,
  SlidersHorizontal,
  Target,
  CreditCard,
  Gift,
  Settings,
  ShieldCheck,
  Sparkles,
  ChevronsUpDown,
  LogOut,
  Lock,
  X,
} from "lucide-react";
import { useState } from "react";
import { signOut } from "@/lib/auth/actions";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/channels", label: "Channels", icon: Send },
  { href: "/signals", label: "Signals", icon: Zap },
  { href: "/risk", label: "Risk", icon: SlidersHorizontal },
  { href: "/prop", label: "Prop Mode", icon: Target },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/refer", label: "Refer & earn", icon: Gift },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Wordmark({ size = "base" }: { size?: "base" | "lg" }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-primary/40 bg-primary/10">
        <ShieldCheck size={16} className="text-primary-light" />
      </span>
      <span className={`font-bold tracking-tight text-text-primary ${size === "lg" ? "text-[18px]" : "text-[16px]"}`}>
        VouchFX
      </span>
    </div>
  );
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  email?: string;
  onTrial?: boolean;
  isAdmin?: boolean;
}

export default function Sidebar({ open, onClose, email = "", onTrial = false, isAdmin = false }: SidebarProps) {
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const nav = isAdmin ? [...NAV, { href: "/admin/payouts", label: "Admin", icon: Lock }] : NAV;

  const initials = email.slice(0, 2).toUpperCase() || "—";
  const name = email.split("@")[0] ?? "";

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="anim-overlay fixed inset-0 z-20 bg-black/60 backdrop-blur-sm lg:hidden" onClick={onClose} />
      )}

      {/* Sidebar panel */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-30 flex w-[236px] flex-col border-r border-border/70 bg-bg px-3.5 py-5",
          "transition-transform duration-200 ease-in-out lg:static lg:h-screen lg:translate-x-0 lg:bg-bg/60",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex items-center justify-between px-2">
          <Wordmark size="lg" />
          <button
            onClick={onClose}
            className="lg:hidden text-text-muted hover:text-text-primary"
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="mt-7 flex flex-1 flex-col gap-1 overflow-y-auto scroll-thin">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={[
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/[0.08] text-text-primary ring-1 ring-primary/25"
                    : "text-text-secondary hover:bg-surface hover:text-text-primary",
                ].join(" ")}
              >
                <Icon
                  size={18}
                  className={active ? "text-primary-light" : "text-text-muted group-hover:text-text-secondary"}
                />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Trial upsell */}
        {onTrial && (
          <div className="mt-3 rounded-2xl border border-border bg-surface p-3.5">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-text-primary">
              <Sparkles size={14} className="text-primary-light" /> Free trial
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-text-muted">1 signal/day on free trial</p>
            <Link
              href="/billing"
              onClick={onClose}
              className="mt-2.5 flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-[12px] font-semibold text-[#04201D] transition-colors hover:bg-primary-light"
            >
              Upgrade to Pro
            </Link>
          </div>
        )}

        {/* User row */}
        <div className="relative mt-3">
          {userMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1.5 overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-lg">
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </form>
            </div>
          )}
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface"
          >
            <div className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated text-[12px] font-bold text-primary-light">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-text-primary">{name}</div>
              <div className="truncate text-[11px] text-text-muted">{email}</div>
            </div>
            <ChevronsUpDown size={15} className="shrink-0 text-text-muted" />
          </button>
        </div>
      </aside>
    </>
  );
}
