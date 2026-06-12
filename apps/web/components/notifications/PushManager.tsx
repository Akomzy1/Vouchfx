"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Smartphone, BellRing, BellOff, Trash2, AlertCircle, Share } from "lucide-react";
import {
  getPushState,
  subscribeToPush,
  unsubscribeFromPush,
  sendTestPush,
  type PushState,
} from "@/lib/push";

interface Device {
  id: string;
  endpoint: string;
  user_agent: string | null;
  created_at: string;
  last_used_at: string | null;
}

function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : "Device";
  const browser = /Edg/.test(ua) ? "Edge" : /Chrome/.test(ua) ? "Chrome" : /Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "Browser";
  return `${browser} on ${os}`;
}

export default function PushManager() {
  const [state, setState] = useState<PushState | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState(await getPushState());
    try {
      const res = await fetch("/api/push/subscriptions");
      if (res.ok) setDevices((await res.json()).devices ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await subscribeToPush();
      await sendTestPush();
      setInfo("Push enabled on this device — we sent a test notification.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await unsubscribeFromPush();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const revoke = useCallback(async (endpoint: string) => {
    setError(null);
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    }).catch(() => undefined);
    await refresh();
  }, [refresh]);

  if (!state) {
    return (
      <div className="px-4 py-4 flex items-center gap-2 text-sm text-text-muted">
        <Loader2 size={14} className="animate-spin" /> Checking push support…
      </div>
    );
  }

  // iOS Safari tab: push only works once installed to the Home Screen.
  if (state.needsInstall) {
    return (
      <div className="px-4 py-4 space-y-2">
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <Share size={16} className="mt-0.5 shrink-0 text-primary" />
          <div className="text-sm text-text-secondary">
            <p className="font-medium text-text-primary">Add VouchFX to your Home Screen first</p>
            <p className="mt-1 text-xs">
              On iPhone &amp; iPad, push notifications only work from the installed app. Tap the
              <span className="font-medium text-text-primary"> Share</span> button in Safari, choose
              <span className="font-medium text-text-primary"> Add to Home Screen</span>, then open
              VouchFX from your Home Screen and enable push here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!state.supported) {
    return (
      <div className="px-4 py-4 flex items-center gap-2 text-sm text-text-muted">
        <BellOff size={14} /> This browser doesn&rsquo;t support push notifications.
      </div>
    );
  }

  const blocked = state.permission === "denied";

  return (
    <div className="px-4 py-4 space-y-4">
      {/* This-device control */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Smartphone size={18} className="mt-0.5 shrink-0 text-text-muted" />
          <div>
            <p className="text-sm font-medium text-text-primary">Push on this device</p>
            <p className="text-xs text-text-muted">
              {state.subscribed
                ? "Enabled — you'll get alerts even when VouchFX is closed."
                : blocked
                ? "Notifications are blocked in your browser settings for this site."
                : "Get trade and account alerts as push notifications."}
            </p>
          </div>
        </div>
        {state.subscribed ? (
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className="btn-ghost text-xs gap-1.5 shrink-0 disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <BellOff size={13} />}
            Disable
          </button>
        ) : (
          <button
            type="button"
            onClick={enable}
            disabled={busy || blocked}
            className="btn-primary text-xs gap-1.5 shrink-0 disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <BellRing size={13} />}
            Enable
          </button>
        )}
      </div>

      {info && <p className="text-xs text-primary-light">{info}</p>}
      {error && (
        <p className="flex items-start gap-1.5 text-xs text-loss">
          <AlertCircle size={12} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {/* Registered devices */}
      {devices.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted mb-2">
            Devices receiving push ({devices.length})
          </p>
          <ul className="space-y-1.5">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-text-primary">{deviceLabel(d.user_agent)}</p>
                  <p className="text-2xs text-text-muted">
                    Added {new Date(d.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(d.endpoint)}
                  className="shrink-0 text-text-muted hover:text-loss"
                  aria-label="Revoke device"
                  title="Revoke this device"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
