"use client";

import { useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import StepTelegram    from "./StepTelegram";
import StepChannels    from "./StepChannels";
import StepBroker      from "./StepBroker";
import StepRisk        from "./StepRisk";
import StepGoLive      from "./StepGoLive";

const STEPS = [
  { n: 1, label: "Connect Telegram" },
  { n: 2, label: "Choose channels"  },
  { n: 3, label: "Connect broker"   },
  { n: 4, label: "Set risk limits"  },
  { n: 5, label: "Go live"          },
];

interface CompletedSteps {
  hasTg:      boolean;
  hasChannel: boolean;
  hasBroker:  boolean;
  hasRisk:    boolean;
}

interface Props {
  initialStep: number;
  completedSteps: CompletedSteps;
  telegramStatus: "active" | "limited" | "banned" | "disconnected" | "none";
  telegramLastConnected: string | null;
  alreadyReferred: boolean;
}

export default function OnboardingWizard({
  initialStep, completedSteps, telegramStatus, telegramLastConnected, alreadyReferred,
}: Props) {
  const [step, setStep] = useState(initialStep);
  const [done, setDone] = useState<CompletedSteps>(completedSteps);

  function advance() {
    setStep((s) => Math.min(s + 1, 5));
  }

  function markDone(key: keyof CompletedSteps) {
    setDone((prev) => ({ ...prev, [key]: true }));
  }

  const stepDone: Record<number, boolean> = {
    1: done.hasTg,
    2: done.hasChannel,
    3: done.hasBroker,
    4: done.hasRisk,
  };

  return (
    <div className="w-full max-w-lg space-y-6">
      {/* Header */}
      <div className="text-center">
        <p className="text-primary text-xs font-semibold uppercase tracking-widest mb-1">VouchFX</p>
        <h1 className="text-2xl font-bold text-text-primary">Set up your account</h1>
        <p className="text-sm text-text-secondary mt-1">Takes about 90 seconds</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-between px-1">
        {STEPS.map((s, i) => {
          const isComplete = stepDone[s.n] ?? false;
          const isActive   = step === s.n;
          return (
            <div key={s.n} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
                    isComplete
                      ? "border-primary bg-primary/20 text-primary"
                      : isActive
                      ? "border-primary bg-surface text-primary"
                      : "border-border bg-surface text-text-muted"
                  }`}
                >
                  {isComplete
                    ? <CheckCircle2 size={14} />
                    : <span className="text-xs font-semibold">{s.n}</span>}
                </div>
                <span className={`text-2xs whitespace-nowrap hidden sm:block ${isActive ? "text-primary" : "text-text-muted"}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-1 ${stepDone[s.n] ? "bg-primary/40" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="card p-6">
        {step === 1 && (
          <StepTelegram
            status={telegramStatus}
            lastConnectedAt={telegramLastConnected}
            alreadyReferred={alreadyReferred}
            onComplete={() => { markDone("hasTg"); advance(); }}
            onSkip={advance}
          />
        )}
        {step === 2 && (
          <StepChannels
            onComplete={() => { markDone("hasChannel"); advance(); }}
            onSkip={advance}
          />
        )}
        {step === 3 && (
          <StepBroker
            onComplete={() => { markDone("hasBroker"); advance(); }}
            onSkip={advance}
          />
        )}
        {step === 4 && (
          <StepRisk
            onComplete={() => { markDone("hasRisk"); advance(); }}
            onSkip={advance}
          />
        )}
        {step === 5 && (
          <StepGoLive allDone={done.hasTg && done.hasChannel && done.hasBroker} />
        )}
      </div>

      {/* Skip-all escape hatch */}
      {step < 5 && (
        <p className="text-center text-xs text-text-muted">
          Already set up?{" "}
          <button
            onClick={() => setStep(5)}
            className="text-primary hover:underline"
          >
            Skip to launch
          </button>
        </p>
      )}
    </div>
  );
}
