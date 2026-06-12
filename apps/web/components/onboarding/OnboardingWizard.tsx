"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Send, List, CandlestickChart, SlidersHorizontal, Rocket,
  Check, ArrowLeft, ArrowRight, X, Loader2,
} from "lucide-react";
import Mark from "@/components/marketing/Mark";
import StepTelegram    from "./StepTelegram";
import StepChannels    from "./StepChannels";
import StepBroker      from "./StepBroker";
import StepRisk        from "./StepRisk";
import StepGoLive      from "./StepGoLive";

const STEPS: [string, React.ElementType][] = [
  ["Telegram", Send],
  ["Channels", List],
  ["Broker", CandlestickChart],
  ["Risk", SlidersHorizontal],
  ["Go live", Rocket],
];

const META: [string, string][] = [
  ["Connect Telegram", "Link the account that follows your signal channels."],
  ["Choose channels", "Pick which channels VouchFX should watch for signals."],
  ["Connect your broker", "Link your MT5 account so we can place your trades."],
  ["Set your risk", "These rules are enforced on every single trade."],
  ["Review & go live", "One last look before VouchFX starts working for you."],
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

function StepHeader({ step, done }: { step: number; done: Record<number, boolean> }) {
  const progress = (step / (STEPS.length - 1)) * 100;
  const ActiveIcon = STEPS[step]?.[1] ?? Send;
  return (
    <div>
      {/* Desktop */}
      <div className="hidden sm:block">
        <div className="relative flex items-center justify-between">
          <div className="absolute left-0 right-0 top-[18px] h-0.5 bg-border" />
          <div className="absolute left-0 top-[18px] h-0.5 bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
          {STEPS.map(([label, Icon], i) => {
            const isDone = i < step || (done[i + 1] ?? false);
            const active = i === step;
            return (
              <div key={label} className="relative z-10 flex flex-col items-center gap-2">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                    isDone && !active
                      ? "border-primary bg-primary text-[#04201D]"
                      : active
                        ? "border-primary bg-bg text-primary-light shadow-[0_0_0_4px_rgba(20,184,166,0.15)]"
                        : "border-border bg-bg text-text-muted"
                  }`}
                >
                  {isDone && !active ? <Check size={17} strokeWidth={2.6} /> : <Icon size={16} />}
                </div>
                <span className={`text-[12px] font-medium transition-colors ${active ? "text-text-primary" : isDone ? "text-text-secondary" : "text-text-muted"}`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {/* Mobile */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-primary bg-bg text-primary-light shadow-[0_0_0_4px_rgba(20,184,166,0.12)]">
              <ActiveIcon size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold text-text-primary">{STEPS[step]?.[0]}</div>
              <div className="num text-[11px] text-text-muted">Step {step + 1} of {STEPS.length}</div>
            </div>
          </div>
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-primary" : i < step ? "w-1.5 bg-primary/60" : "w-1.5 bg-border"}`} />
            ))}
          </div>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function OnboardingWizard({
  initialStep, completedSteps, telegramStatus, telegramLastConnected, alreadyReferred,
}: Props) {
  const router = useRouter();
  // Internal step index is 0-based; props are 1-based
  const [step, setStep] = useState(Math.max(0, Math.min(4, initialStep - 1)));
  const [done, setDone] = useState<CompletedSteps>(completedSteps);
  const [exiting, setExiting] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    window.scrollTo({ top: 0 });
  }, [step]);

  function advance() {
    setStep((s) => Math.min(s + 1, 4));
  }
  function back() {
    setStep((s) => Math.max(0, s - 1));
  }
  function markDone(key: keyof CompletedSteps) {
    setDone((prev) => ({ ...prev, [key]: true }));
  }

  // "Save & exit" — mark onboarding complete; the dashboard's setup card
  // surfaces any steps that are still missing.
  async function saveAndExit() {
    setExiting(true);
    try {
      await fetch("/api/onboarding/complete", { method: "POST" });
    } finally {
      router.push("/dashboard");
    }
  }

  const stepDone: Record<number, boolean> = {
    1: done.hasTg,
    2: done.hasChannel,
    3: done.hasBroker,
    4: done.hasRisk,
  };

  const last = step === 4;

  return (
    <div className="grid-glow relative flex min-h-screen flex-col bg-bg">
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-40" />

      {/* Top bar */}
      <header className="relative z-10 border-b border-border/70 bg-bg/60 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Mark size={24} />
            <span className="text-[16px] font-bold tracking-tight text-text-primary">
              Vouch<span className="text-primary">FX</span>
            </span>
          </div>
          <button
            onClick={saveAndExit}
            disabled={exiting}
            className="flex items-center gap-1.5 text-[13px] font-medium text-text-muted transition-colors hover:text-text-secondary disabled:opacity-60"
          >
            {exiting ? <Loader2 size={14} className="animate-spin" /> : null}
            Save &amp; exit <X size={15} />
          </button>
        </div>
      </header>

      {/* Body */}
      <main className="relative z-10 flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-2xl px-5 pt-7">
          <StepHeader step={step} done={stepDone} />
        </div>

        <div ref={scrollRef} className="mx-auto w-full max-w-2xl flex-1 px-5 pb-6 pt-7">
          <div key={step} className="anim-fade">
            <div className="mb-5">
              <h1 className="text-xl font-bold tracking-tight text-text-primary sm:text-[1.4rem]">{META[step]?.[0]}</h1>
              <p className="mt-1 text-[14px] text-text-secondary">{META[step]?.[1]}</p>
            </div>

            {step === 0 && (
              <StepTelegram
                status={telegramStatus}
                lastConnectedAt={telegramLastConnected}
                alreadyReferred={alreadyReferred}
                onComplete={() => { markDone("hasTg"); advance(); }}
                onSkip={advance}
              />
            )}
            {step === 1 && (
              <StepChannels
                onComplete={() => { markDone("hasChannel"); advance(); }}
                onSkip={advance}
              />
            )}
            {step === 2 && (
              <StepBroker
                onComplete={() => { markDone("hasBroker"); advance(); }}
                onSkip={advance}
              />
            )}
            {step === 3 && (
              <StepRisk
                onComplete={() => { markDone("hasRisk"); advance(); }}
                onSkip={advance}
              />
            )}
            {step === 4 && (
              <StepGoLive allDone={done.hasTg && done.hasChannel && done.hasBroker} />
            )}
          </div>
        </div>
      </main>

      {/* Footer nav */}
      <footer className="sticky bottom-0 z-20 border-t border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-3.5">
          <button
            onClick={back}
            disabled={step === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:border-text-muted hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft size={16} /> Back
          </button>

          <div className="num hidden text-[12px] text-text-muted sm:block">{step + 1} / {STEPS.length}</div>

          {!last ? (
            <button
              onClick={advance}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-[#04201D] shadow-[0_8px_24px_-8px_rgba(20,184,166,0.6)] transition-all hover:bg-primary-light active:translate-y-px"
            >
              Next <ArrowRight size={16} />
            </button>
          ) : (
            <div className="w-[88px]" />
          )}
        </div>
      </footer>
    </div>
  );
}
