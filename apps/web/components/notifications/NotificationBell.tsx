"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, TrendingUp, TrendingDown, AlertTriangle, Radio, Shield, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { NotifyEventType } from "@vouchfx/core";

interface Notification {
  id: string;
  event_type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function EventIcon({ type }: { type: string }) {
  const cls = "shrink-0";
  switch (type as NotifyEventType) {
    case "trade_opened":        return <TrendingUp   size={14} className={`text-profit ${cls}`} />;
    case "trade_closed":        return <TrendingDown size={14} className={`text-text-secondary ${cls}`} />;
    case "daily_loss_cap_hit":  return <AlertTriangle size={14} className={`text-warning ${cls}`} />;
    case "broker_disconnect":   return <Shield        size={14} className={`text-loss ${cls}`} />;
    case "telegram_session_limited": return <Radio    size={14} className={`text-warning ${cls}`} />;
    default:                    return <Bell          size={14} className={`text-text-muted ${cls}`} />;
  }
}

export default function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = items.filter((n) => !n.read_at).length;

  const fetchNotifications = useCallback(async () => {
    const res = await fetch("/api/notifications");
    if (res.ok) {
      const json = await res.json();
      setItems(json.notifications as Notification[]);
      setLoaded(true);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime: listen for new notifications for this user
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function handleOpen() {
    setOpen((v) => !v);
    if (!open && unreadCount > 0) {
      // Mark all read optimistically then call API
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
      await fetch("/api/notifications/all/read", { method: "POST" });
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-border bg-surface-elevated shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-text-primary">Notifications</p>
            <button
              onClick={() => setOpen(false)}
              className="text-text-muted hover:text-text-primary"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {!loaded ? (
              <div className="p-6 text-center text-xs text-text-muted">Loading…</div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center">
                <Bell size={20} className="mx-auto text-text-muted mb-2" />
                <p className="text-xs text-text-muted">No notifications yet.</p>
              </div>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 transition-colors ${
                    !n.read_at ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="mt-0.5">
                    <EventIcon type={n.event_type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{n.title}</p>
                    {n.body && (
                      <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{n.body}</p>
                    )}
                    <p className="text-xs text-text-muted mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
