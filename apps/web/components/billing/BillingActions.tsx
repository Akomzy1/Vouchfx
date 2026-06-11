"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

type CheckoutProps = {
  action: "checkout";
  plan: "starter" | "pro" | "funded" | "lifetime";
  isCurrent?: boolean;
  label: string;
};

type PortalProps = {
  action: "portal";
  label: string;
};

type Props = CheckoutProps | PortalProps;

export default function BillingActions(props: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (props.action === "checkout" && props.isCurrent) return;
    setLoading(true);
    setError(null);
    try {
      let url: string;
      if (props.action === "checkout") {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: props.plan }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to create checkout");
        url = json.url;
      } else {
        const res = await fetch("/api/billing/portal", { method: "POST" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to open portal");
        url = json.url;
      }
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  const isCurrent = props.action === "checkout" && props.isCurrent;

  return (
    <div className="space-y-1">
      <button
        onClick={handleClick}
        disabled={loading || isCurrent}
        className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-all ${
          isCurrent
            ? "bg-primary/10 text-primary cursor-default"
            : "bg-primary text-white hover:opacity-90 active:scale-95 disabled:opacity-50"
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            Redirecting…
          </span>
        ) : (
          props.label
        )}
      </button>
      {error && (
        <p className="text-xs text-loss text-center">{error}</p>
      )}
    </div>
  );
}
