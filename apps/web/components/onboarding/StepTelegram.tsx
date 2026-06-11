"use client";

import { useState } from "react";
import ConnectFlow from "@/components/telegram/ConnectFlow";

interface Props {
  status: "active" | "limited" | "banned" | "disconnected" | "none";
  lastConnectedAt: string | null;
  alreadyReferred: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export default function StepTelegram({ status, lastConnectedAt, alreadyReferred, onComplete, onSkip }: Props) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [referralCode, setReferralCode] = useState("");

  const connected = currentStatus === "active";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Connect Telegram</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          VouchFX reads signals from your channels. Your session is read-only — we never send messages.
        </p>
      </div>

      <ConnectFlow
        initialStatus={currentStatus}
        lastConnectedAt={lastConnectedAt}
        onStatusChange={(s: string) => setCurrentStatus(s as typeof currentStatus)}
      />

      {/* Optional referral code for users who got the code out-of-band */}
      {!alreadyReferred && (
        <div className="space-y-1">
          <label className="text-xs text-text-muted">Referral code (optional)</label>
          <input
            type="text"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
            placeholder="e.g. AB12CD34"
            maxLength={16}
            className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <p className="text-2xs text-text-muted">If someone shared a code with you, enter it here.</p>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onComplete}
          disabled={!connected}
          className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
          data-referral={referralCode || undefined}
        >
          {connected ? "Continue" : "Waiting for connection…"}
        </button>
        {!connected && (
          <button onClick={onSkip} className="btn-ghost px-3">
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
