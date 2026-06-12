"use client";

import { useState, useCallback } from "react";
import { Loader2, AlertCircle, Mail, Bell } from "lucide-react";
import { NOTIFY_EVENT_META, type NotifyEventType } from "@vouchfx/core";

interface Pref {
  event_type: NotifyEventType;
  email_enabled: boolean;
  in_app_enabled: boolean;
}

export default function NotificationPreferences({ initial }: { initial: Pref[] }) {
  const [prefs, setPrefs] = useState<Pref[]>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(async (
    eventType: NotifyEventType,
    field: "email_enabled" | "in_app_enabled",
    value: boolean
  ) => {
    const key = `${eventType}:${field}`;
    setSaving(key);
    setError(null);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: eventType, [field]: value }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setPrefs((prev) =>
        prev.map((p) =>
          p.event_type === eventType ? { ...p, [field]: value } : p
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }, []);

  return (
    <div className="space-y-1">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-2">
        <div className="flex-1" />
        <div className="flex items-center gap-6 text-xs text-text-muted w-24 justify-end">
          <span className="flex items-center gap-1"><Bell size={11} /> In-app</span>
          <span className="flex items-center gap-1"><Mail size={11} /> Email</span>
        </div>
      </div>

      {prefs.map((pref) => {
        const meta = NOTIFY_EVENT_META[pref.event_type];
        return (
          <div
            key={pref.event_type}
            className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">{meta.title}</p>
              <p className="text-xs text-text-muted">{meta.description}</p>
            </div>
            <div className="flex items-center gap-6 w-24 justify-end">
              <Toggle
                checked={pref.in_app_enabled}
                busy={saving === `${pref.event_type}:in_app_enabled`}
                onChange={(v) => toggle(pref.event_type, "in_app_enabled", v)}
                label="In-app"
              />
              <Toggle
                checked={pref.email_enabled}
                busy={saving === `${pref.event_type}:email_enabled`}
                onChange={(v) => toggle(pref.event_type, "email_enabled", v)}
                label="Email"
              />
            </div>
          </div>
        );
      })}

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-loss">
          <AlertCircle size={12} />
          {error}
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  busy,
  onChange,
  label,
}: {
  checked: boolean;
  busy: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  if (busy) {
    return <Loader2 size={14} className="animate-spin text-text-muted" />;
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        checked ? "bg-primary" : "bg-border"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}
