"use client";

import { useState, useEffect } from "react";
import { Radio, Loader2 } from "lucide-react";

interface Channel { id: string; title: string | null; telegram_chat_id: number; is_enabled: boolean }

interface Props {
  onComplete: () => void;
  onSkip: () => void;
}

export default function StepChannels({ onComplete, onSkip }: Props) {
  const [channels, setChannels]   = useState<Channel[]>([]);
  const [loading, setLoading]     = useState(true);
  const [toggling, setToggling]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/channels").then((r) => r.json()).then((d) => {
      setChannels((d.channels ?? []) as Channel[]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function toggle(id: string, enabled: boolean) {
    setToggling(id);
    try {
      await fetch(`/api/channels/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled: enabled }),
      });
      setChannels((prev) => prev.map((c) => c.id === id ? { ...c, is_enabled: enabled } : c));
    } finally {
      setToggling(null);
    }
  }

  const hasEnabled = channels.some((c) => c.is_enabled);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Choose channels</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Enable the channels you want VouchFX to watch for signals.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-text-muted">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : channels.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-elevated px-4 py-5 text-center">
          <Radio size={20} className="mx-auto text-text-muted mb-2" />
          <p className="text-sm text-text-secondary">No channels found.</p>
          <p className="text-xs text-text-muted mt-0.5">
            You&apos;ll add channels from Settings after connecting Telegram.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {channels.map((ch) => (
            <li key={ch.id} className="flex items-center justify-between px-4 py-3 bg-surface">
              <span className="text-sm text-text-primary">
                {ch.title ?? `Chat ${ch.telegram_chat_id}`}
              </span>
              <button
                onClick={() => toggle(ch.id, !ch.is_enabled)}
                disabled={toggling === ch.id}
                className={`relative h-5 w-9 rounded-full transition-colors ${ch.is_enabled ? "bg-primary" : "bg-border"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${ch.is_enabled ? "translate-x-4" : ""}`}
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={onComplete} disabled={!hasEnabled} className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed">
          Continue
        </button>
        <button onClick={onSkip} className="btn-ghost px-3">Skip</button>
      </div>
    </div>
  );
}
