"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import BottomNav from "@/components/layout/BottomNav";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

const TITLES: [string, string][] = [
  ["/dashboard", "Dashboard"],
  ["/channels", "Channels"],
  ["/signals", "Signals"],
  ["/performance", "Performance"],
  ["/risk", "Risk"],
  ["/prop", "Prop Mode"],
  ["/billing", "Billing"],
  ["/refer", "Refer & earn"],
  ["/settings", "Settings"],
];

type ConnStatus = "connected" | "disconnected" | "none";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [brokerStatus, setBrokerStatus] = useState<ConnStatus>("none");
  const [brokerLabel, setBrokerLabel] = useState<string | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<ConnStatus>("none");
  const [onTrial, setOnTrial] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const pathname = usePathname();

  const title = TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? "";

  // Close sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    // Show the Admin link only to admins (is_admin is RLS-safe, scoped to the
    // caller). The /admin routes are independently gated server-side regardless.
    db.rpc("is_admin").then(({ data }: { data: boolean | null }) => setIsAdmin(data === true));

    db.from("broker_connections")
      .select("label, status, is_active")
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }: { data: { label: string | null; status: string | null; is_active: boolean } | null }) => {
        if (!data) {
          setBrokerStatus("none");
          return;
        }
        setBrokerLabel(data.label);
        setBrokerStatus(data.status === "connected" || data.is_active ? "connected" : "disconnected");
      });

    db.from("telegram_sessions")
      .select("status")
      .limit(1)
      .maybeSingle()
      .then(({ data }: { data: { status: string | null } | null }) => {
        setTelegramStatus(!data ? "none" : data.status === "active" ? "connected" : "disconnected");
      });

    db.from("subscriptions")
      .select("plan, status")
      .in("status", ["trialing", "active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }: { data: { plan: string | null; status: string | null } | null }) => {
        setOnTrial(!data || data.plan === "trial" || data.status === "trialing");
      });
  }, []);

  return (
    <div className="grid-glow flex h-screen overflow-hidden bg-bg">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        email={user?.email ?? ""}
        onTrial={onTrial}
        isAdmin={isAdmin}
      />

      <div className="dot-grid relative flex flex-1 flex-col min-w-0 overflow-hidden">
        {user && (
          <TopBar
            user={user}
            title={title}
            brokerLabel={brokerLabel}
            brokerStatus={brokerStatus}
            telegramStatus={telegramStatus}
            onMenuClick={() => setSidebarOpen(true)}
          />
        )}
        <main className="scroll-thin flex-1 overflow-y-auto px-4 pb-24 pt-5 sm:px-6 lg:pb-8">
          <div className="mx-auto w-full max-w-[1180px]">{children}</div>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
