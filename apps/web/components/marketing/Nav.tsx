"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Send, Menu, X } from "lucide-react";
import Mark from "./Mark";
import { REFERRAL_AFFILIATE_ENABLED } from "@/lib/flags";

const TELEGRAM_URL = "https://t.me/getvouchfx";

const LINKS: [string, string][] = [
  ["Features", "#features"],
  ["How it works", "#how"],
  ["Pricing", "#pricing"],
  // "Affiliates" anchor returns when the referral/affiliate program is enabled.
  ...(REFERRAL_AFFILIATE_ENABLED ? [["Affiliates", "#affiliates"] as [string, string]] : []),
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const close = () => setOpen(false);

  return (
    <header
      className={`sticky top-0 z-50 transition-colors ${
        scrolled ? "border-b border-border bg-bg/85 backdrop-blur-md" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark size={26} />
          <span className="text-[17px] font-bold tracking-tight text-text-primary">
            Vouch<span className="text-primary">FX</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map(([label, href]) => (
            <a
              key={label}
              href={href}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              {label}
            </a>
          ))}
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <Send size={15} /> Telegram
          </a>
          <Link
            href="/login"
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            Login
          </Link>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-[#04201D] shadow-[0_8px_24px_-8px_rgba(20,184,166,0.6)] transition-all hover:bg-primary-light hover:shadow-[0_10px_30px_-8px_rgba(20,184,166,0.7)] active:translate-y-px"
          >
            Start free trial
          </Link>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-text-primary md:hidden"
          aria-label="Menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-bg/95 px-5 pb-5 pt-2 backdrop-blur md:hidden">
          <nav className="flex flex-col">
            {LINKS.map(([label, href]) => (
              <a
                key={label}
                href={href}
                onClick={close}
                className="border-b border-border/60 py-3 text-sm font-medium text-text-secondary"
              >
                {label}
              </a>
            ))}
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              className="flex items-center gap-1.5 border-b border-border/60 py-3 text-sm font-medium text-text-secondary"
            >
              <Send size={15} /> Telegram
            </a>
            <Link
              href="/login"
              onClick={close}
              className="border-b border-border/60 py-3 text-sm font-medium text-text-secondary"
            >
              Login
            </Link>
          </nav>
          <Link
            href="/signup"
            onClick={close}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-[15px] font-semibold text-[#04201D] shadow-[0_8px_24px_-8px_rgba(20,184,166,0.6)] transition-all hover:bg-primary-light active:translate-y-px"
          >
            Start free trial
          </Link>
        </div>
      )}
    </header>
  );
}
