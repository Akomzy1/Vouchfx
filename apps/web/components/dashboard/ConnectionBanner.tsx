"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleCheck, TriangleAlert, RefreshCw, X } from "lucide-react";

interface Props {
  brokerOk: boolean;
  telegramOk: boolean;
  brokerLabel?: string | null;
}

export default function ConnectionBanner({ brokerOk, telegramOk, brokerLabel }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (!brokerOk) {
    return (
      <div className="anim-banner mb-5 flex flex-col gap-3 overflow-hidden rounded-2xl border border-loss/30 bg-loss/[0.07] p-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-loss/40 bg-loss/15 text-loss">
            <TriangleAlert size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold text-text-primary">Broker connection lost</div>
            <p className="mt-0.5 text-[13px] leading-relaxed text-text-secondary">
              VouchFX can&rsquo;t reach your{" "}
              <span className="text-text-primary">{brokerLabel ?? "broker"}</span> account. New signals
              are <span className="text-text-primary">queued, not executed</span>. Open positions are unaffected.
            </p>
          </div>
        </div>
        <Link
          href="/settings"
          className="ml-12 inline-flex items-center justify-center gap-1.5 rounded-xl bg-loss px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 active:translate-y-px sm:ml-auto sm:shrink-0"
        >
          <RefreshCw size={15} /> Reconnect
        </Link>
      </div>
    );
  }

  if (dismissed) return null;

  return (
    <div className="anim-banner mb-5 flex items-center gap-3 overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.05] px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary-light">
        <CircleCheck size={17} />
      </div>
      <p className="flex-1 text-[13px] text-text-secondary">
        <span className="font-semibold text-text-primary">All systems operational.</span>{" "}
        {brokerLabel ?? "Broker"} connected{telegramOk ? ", Telegram listening" : ""} — signals are
        executing under your risk rules.
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-lg p-1 text-text-muted transition-colors hover:text-text-primary"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
