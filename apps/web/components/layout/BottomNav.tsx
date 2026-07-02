"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Send,
  Zap,
  BarChart3,
  SlidersHorizontal,
  Target,
  CreditCard,
  Gift,
  Settings,
  MoreHorizontal,
} from "lucide-react";
import { REFERRAL_AFFILIATE_ENABLED } from "@/lib/flags";

const MAIN = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/channels", label: "Channels", icon: Send },
  { href: "/signals", label: "Signals", icon: Zap },
  { href: "/risk", label: "Risk", icon: SlidersHorizontal },
];

const MORE = [
  { href: "/performance", label: "Performance", icon: BarChart3 },
  { href: "/prop", label: "Prop Mode", icon: Target },
  { href: "/billing", label: "Billing", icon: CreditCard },
  // "Refer & earn" is shown only when the referral/affiliate program is enabled.
  ...(REFERRAL_AFFILIATE_ENABLED
    ? [{ href: "/refer", label: "Refer & earn", icon: Gift }]
    : []),
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="anim-overlay absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          <div className="anim-fade absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-surface p-3 pb-6">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-border" />
            {MORE.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${
                  isActive(href) ? "bg-primary/[0.08] text-text-primary" : "text-text-secondary"
                }`}
              >
                <Icon size={18} className="text-text-muted" /> {label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-border bg-bg/90 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {MAIN.map(({ href, label, icon: Icon }) => {
          const on = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                on ? "text-primary-light" : "text-text-muted"
              }`}
            >
              <Icon size={20} strokeWidth={on ? 2.3 : 2} />
              {label}
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-text-muted"
        >
          <MoreHorizontal size={20} /> More
        </button>
      </nav>
    </>
  );
}
