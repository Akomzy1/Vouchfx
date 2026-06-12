"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProfileName({ initialName }: { initialName: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: value }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Could not save name.");
      return;
    }
    setName(value.trim());
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs text-text-muted">Name</p>
          <p className="text-sm text-text-primary">
            {name || <span className="text-text-muted">Not set</span>}
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() => {
            setValue(name);
            setEditing(true);
          }}
        >
          {name ? "Edit" : "Add"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-text-muted">Name</p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          autoFocus
          maxLength={80}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Your name"
        />
        <button
          type="button"
          className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
          disabled={saving || value.trim().length === 0}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-loss">{error}</p>}
    </div>
  );
}
