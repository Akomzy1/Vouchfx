"use client";

import { useState, useCallback } from "react";
import { Radio, RefreshCw, Loader2, AlertCircle, Hash, Megaphone } from "lucide-react";
import type { TelegramDialog } from "@/app/api/telegram/channels/route";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChannelSource {
  id: string;
  telegram_chat_id: string;
  title: string | null;
  is_enabled: boolean;
  daily_signal_limit: number | null;
}

interface ChannelListProps {
  /** Sources already in DB — passed from server at render time. */
  initialSources: ChannelSource[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ChannelIcon({ isChannel }: { isChannel: boolean }) {
  return isChannel
    ? <Megaphone size={14} className="text-text-muted shrink-0" />
    : <Hash size={14} className="text-text-muted shrink-0" />;
}

function formatMembers(count: number | null): string {
  if (count === null) return "";
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k members`;
  return `${count} members`;
}

// ─── ChannelRow ───────────────────────────────────────────────────────────────

function ChannelRow({
  chatId,
  title,
  isChannel,
  isMegagroup,
  participantsCount,
  source,
  onToggle,
}: TelegramDialog & {
  source: ChannelSource | undefined;
  onToggle: (chatId: string, title: string, isChannel: boolean, source: ChannelSource | undefined) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const enabled = source?.is_enabled ?? false;

  async function handleToggle() {
    setBusy(true);
    try {
      await onToggle(chatId, title, isChannel, source);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between py-3 px-1 border-b border-border last:border-0">
      <div className="flex items-start gap-2 min-w-0">
        <ChannelIcon isChannel={isChannel && !isMegagroup} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{title}</p>
          <p className="text-xs text-text-muted">
            {isChannel && !isMegagroup ? "Channel" : isMegagroup ? "Supergroup" : "Group"}
            {participantsCount !== null && ` · ${formatMembers(participantsCount)}`}
          </p>
        </div>
      </div>
      <button
        onClick={handleToggle}
        disabled={busy}
        aria-label={enabled ? `Disable ${title}` : `Enable ${title}`}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ml-3 ${
          enabled ? "bg-primary" : "bg-border"
        }`}
      >
        {busy ? (
          <Loader2 size={10} className="absolute inset-0 m-auto animate-spin text-white" />
        ) : (
          <span
            className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-[18px]" : "translate-x-[2px]"
            }`}
          />
        )}
      </button>
    </div>
  );
}

// ─── ChannelList ─────────────────────────────────────────────────────────────

export default function ChannelList({ initialSources }: ChannelListProps) {
  const [sources, setSources] = useState<ChannelSource[]>(initialSources);
  const [dialogs, setDialogs] = useState<TelegramDialog[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  // Build lookup map: chatId.toString() → source
  const sourceMap = new Map(sources.map(s => [String(s.telegram_chat_id), s]));

  async function discover() {
    setDiscovering(true);
    setDiscoverError(null);
    try {
      const res = await fetch("/api/telegram/channels");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load channels");
      setDialogs(json.channels as TelegramDialog[]);
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscovering(false);
    }
  }

  const handleToggle = useCallback(async (
    chatId: string,
    title: string,
    _isChannel: boolean,
    source: ChannelSource | undefined
  ) => {
    if (source) {
      // Disable: remove from signal_sources
      const res = await fetch(`/api/channels/${source.id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setSources(prev => prev.filter(s => s.id !== source.id));
      }
    } else {
      // Enable: add to signal_sources
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_chat_id: chatId, title }),
      });
      const json = await res.json();
      if (res.ok) {
        setSources(prev => [...prev, json.source as ChannelSource]);
      }
    }
  }, []);

  // Build the list to render: if discovered, merge; else show enabled sources only
  const rows: (TelegramDialog & { source: ChannelSource | undefined })[] = dialogs
    ? dialogs.map(d => ({ ...d, source: sourceMap.get(d.chatId) }))
    : sources.map(s => ({
        chatId: String(s.telegram_chat_id),
        title: s.title ?? `Chat ${s.telegram_chat_id}`,
        isChannel: false,
        isMegagroup: false,
        participantsCount: null,
        source: s,
      }));

  const enabledCount = sources.filter(s => s.is_enabled).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">Signal channels</p>
          <p className="text-xs text-text-secondary">
            {enabledCount === 0
              ? "No channels enabled — discover and toggle to start copying."
              : `${enabledCount} channel${enabledCount !== 1 ? "s" : ""} enabled`}
          </p>
        </div>
        <button
          onClick={discover}
          disabled={discovering}
          className="flex items-center gap-1.5 text-xs text-primary hover:opacity-80 disabled:opacity-50"
        >
          {discovering ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          {dialogs ? "Refresh" : "Discover channels"}
        </button>
      </div>

      {/* Error */}
      {discoverError && (
        <div className="flex items-start gap-2 rounded-lg border border-loss/30 bg-red-900/20 px-3 py-2 text-xs text-loss">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{discoverError}</span>
        </div>
      )}

      {/* Channel rows */}
      {rows.length > 0 ? (
        <div className="card divide-y divide-border px-4 py-0">
          {rows.map(row => (
            <ChannelRow
              key={row.chatId}
              {...row}
              onToggle={handleToggle}
            />
          ))}
        </div>
      ) : !discovering && (
        <div className="card p-8 text-center space-y-2">
          <Radio size={24} className="mx-auto text-text-muted" />
          <p className="text-sm text-text-muted">No channels yet.</p>
          <p className="text-xs text-text-muted">
            Click <strong className="text-text-secondary">Discover channels</strong> to load
            all Telegram channels and groups you belong to.
          </p>
        </div>
      )}

      {discovering && rows.length === 0 && (
        <div className="card p-8 flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin text-primary" />
          <p className="text-xs text-text-secondary">
            Connecting to Telegram to load your channels…
          </p>
        </div>
      )}
    </div>
  );
}
