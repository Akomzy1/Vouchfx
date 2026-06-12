"use client";

import { useState } from "react";
import { Menu, LogOut, Send, PlugZap } from "lucide-react";
import { signOut } from "@/lib/auth/actions";
import NotificationBell from "@/components/notifications/NotificationBell";
import { Wordmark } from "@/components/layout/Sidebar";
import type { User } from "@supabase/supabase-js";

interface TopBarProps {
  user: User;
  title?: string;
  brokerLabel?: string | null;
  brokerStatus?: "connected" | "disconnected" | "none";
  telegramStatus?: "connected" | "disconnected" | "none";
  onMenuClick: () => void;
}

export default function TopBar({
  user,
  title = "",
  brokerLabel,
  brokerStatus = "none",
  telegramStatus = "none",
  onMenuClick,
}: TopBarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const email = user.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-bg/75 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        {/* Mobile: hamburger + wordmark; desktop: page title */}
        <button
          onClick={onMenuClick}
          className="lg:hidden text-text-muted hover:text-text-primary"
          aria-label="Open sidebar"
        >
          <Menu size={20} />
        </button>
        <div className="lg:hidden">
          <Wordmark />
        </div>
        <div className="hidden min-w-0 lg:block">
          <h1 className="text-[17px] font-bold tracking-tight text-text-primary">{title}</h1>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Broker pill */}
          {brokerStatus !== "none" && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                brokerStatus === "connected"
                  ? "border-primary/30 bg-primary/10 text-primary-light"
                  : "border-loss/30 bg-loss/10 text-loss"
              }`}
            >
              {brokerStatus === "connected" ? (
                <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              ) : (
                <PlugZap size={13} />
              )}
              {brokerLabel && <span className="hidden sm:inline">{brokerLabel} — </span>}
              {brokerStatus === "connected" ? "Connected" : "Disconnected"}
            </span>
          )}

          {/* Telegram pill */}
          {telegramStatus !== "none" && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                telegramStatus === "connected"
                  ? "border-primary/30 bg-primary/10 text-primary-light"
                  : "border-warning/30 bg-warning/10 text-warning"
              }`}
              title="Telegram listener status"
            >
              <Send size={13} />
              <span className="hidden sm:inline">Telegram</span>
              <span className="sm:hidden">TG</span>
              {telegramStatus === "connected" && (
                <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              )}
            </span>
          )}

          <NotificationBell userId={user.id} />

          {/* Avatar + sign-out menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="num flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-elevated text-[12px] font-bold text-primary-light transition-colors hover:border-primary/40"
              aria-label="Account menu"
            >
              {initials}
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
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
      </div>
    </header>
  );
}
