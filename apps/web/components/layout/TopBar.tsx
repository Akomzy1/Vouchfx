"use client";

import { useState } from "react";
import { Menu, LogOut, ChevronDown } from "lucide-react";
import { signOut } from "@/lib/auth/actions";
import NotificationBell from "@/components/notifications/NotificationBell";
import type { User } from "@supabase/supabase-js";

interface TopBarProps {
  user: User;
  brokerStatus?: "connected" | "disconnected" | "none";
  telegramStatus?: "connected" | "disconnected" | "none";
  onMenuClick: () => void;
}

export default function TopBar({
  user,
  brokerStatus = "none",
  telegramStatus = "none",
  onMenuClick,
}: TopBarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const email = user.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4 gap-4">
      {/* Left: hamburger (mobile) */}
      <button
        onClick={onMenuClick}
        className="lg:hidden text-text-muted hover:text-text-primary"
        aria-label="Open sidebar"
      >
        <Menu size={20} />
      </button>

      {/* Status pills */}
      <div className="flex items-center gap-2 flex-1">
        <ConnectionPill label="Broker" status={brokerStatus} />
        <ConnectionPill label="Telegram" status={telegramStatus} />
      </div>

      {/* Bell + user menu */}
      <div className="flex items-center gap-2">
        <NotificationBell userId={user.id} />

        <div className="relative">
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-elevated transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
              {initials}
            </div>
            <span className="hidden sm:block text-xs text-text-secondary max-w-[120px] truncate">
              {email}
            </span>
            <ChevronDown size={14} className="text-text-muted" />
          </button>

          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setUserMenuOpen(false)}
              />
              <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-border bg-surface-elevated shadow-lg">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-xs text-text-muted truncate">{email}</p>
                </div>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function ConnectionPill({
  label,
  status,
}: {
  label: string;
  status: "connected" | "disconnected" | "none";
}) {
  if (status === "none") return null;

  const styles = {
    connected: "pill-connected",
    disconnected: "pill-error",
  }[status];

  const dotColor = {
    connected: "bg-profit",
    disconnected: "bg-loss",
  }[status];

  const text = status === "connected" ? "Connected" : "Disconnected";

  return (
    <span className={`pill ${styles}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {label}: {text}
    </span>
  );
}
