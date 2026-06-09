import { Radio } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Channels" };

export default function ChannelsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Channels</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Manage the Telegram channels you copy signals from.
        </p>
      </div>

      <div className="card p-10 text-center space-y-3">
        <Radio size={32} className="mx-auto text-text-muted" />
        <p className="font-medium text-text-primary">No channels connected</p>
        <p className="text-sm text-text-secondary max-w-xs mx-auto">
          Connect Telegram first to discover and enable channels. Coming in P1.3 → P1.5.
        </p>
      </div>
    </div>
  );
}
