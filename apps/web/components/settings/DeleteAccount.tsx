"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Loader2, AlertCircle } from "lucide-react";

export default function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [owed, setOwed] = useState(false);

  async function remove() {
    setBusy(true);
    setError(null);
    setOwed(false);
    const res = await fetch("/api/account", { method: "DELETE" });
    if (res.ok) {
      router.push("/login");
      return;
    }
    const body = await res.json().catch(() => null);
    setBusy(false);
    setOwed(body?.code === "owed_balance");
    setError(body?.error ?? "Could not delete account.");
  }

  if (!open) {
    return (
      <div className="px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 text-sm text-loss hover:opacity-80"
        >
          <Trash2 size={14} />
          Delete account
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-3">
      <div>
        <p className="text-sm font-medium text-text-primary">Delete account</p>
        <p className="mt-0.5 text-xs text-text-muted">
          Permanently deletes your account, broker connections, Telegram session, and settings.
          This cannot be undone. Type <span className="font-semibold text-text-secondary">DELETE</span> to confirm.
        </p>
      </div>

      <input
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="DELETE"
        className="w-40 rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:border-loss focus:outline-none"
      />

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>
            {error}{" "}
            {owed && (
              <Link href="/refer" className="underline hover:opacity-80">
                Go to Refer &amp; earn
              </Link>
            )}
          </span>
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || confirm !== "DELETE"}
          onClick={remove}
          className="flex items-center gap-1.5 rounded-lg bg-loss px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          Permanently delete
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setConfirm(""); setError(null); }}
          className="btn-ghost text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
