"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Send, Menu, X } from "lucide-react";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const close = () => setOpen(false);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-200 ${
        scrolled ? "bg-bg/95 backdrop-blur-sm border-b border-border" : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between gap-6">
        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          <span className="font-bold tracking-tight text-text-primary">VouchFX</span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-6 text-sm text-text-secondary flex-1">
          <a href="#features" className="hover:text-text-primary transition-colors">Features</a>
          <a href="#how" className="hover:text-text-primary transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-text-primary transition-colors">Pricing</a>
          <a href="#affiliates" className="hover:text-text-primary transition-colors">Affiliates</a>
          <a
            href="https://t.me/getvouchfx"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-text-primary transition-colors"
          >
            <Send size={13} />
            Telegram
          </a>
        </nav>

        {/* Desktop auth CTAs */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          <Link
            href="/auth/login"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Log in
          </Link>
          <Link href="/auth/signup" className="btn-primary py-1.5 px-4 text-sm">
            Start free trial
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-1 text-text-secondary hover:text-text-primary transition-colors"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden bg-bg/98 backdrop-blur-sm border-b border-border px-4 pb-5 space-y-1">
          <a href="#features" className="block py-2.5 text-sm text-text-secondary hover:text-text-primary" onClick={close}>Features</a>
          <a href="#how" className="block py-2.5 text-sm text-text-secondary hover:text-text-primary" onClick={close}>How it works</a>
          <a href="#pricing" className="block py-2.5 text-sm text-text-secondary hover:text-text-primary" onClick={close}>Pricing</a>
          <a href="#affiliates" className="block py-2.5 text-sm text-text-secondary hover:text-text-primary" onClick={close}>Affiliates</a>
          <a
            href="https://t.me/getvouchfx"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 py-2.5 text-sm text-text-secondary hover:text-text-primary"
            onClick={close}
          >
            <Send size={13} />
            Telegram
          </a>
          <div className="pt-3 flex flex-col gap-2">
            <Link href="/auth/login" className="btn-ghost text-sm w-full justify-center" onClick={close}>
              Log in
            </Link>
            <Link href="/auth/signup" className="btn-primary text-sm w-full justify-center" onClick={close}>
              Start free trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
