"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/app/settings`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }
  }

  return (
    <div className="card p-6 space-y-5">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-text-primary">Reset password</h1>
        <p className="text-sm text-text-secondary">
          Enter your email and we&apos;ll send a reset link.
        </p>
      </div>

      {success ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-primary/30 bg-teal-900/20 px-4 py-3 text-sm text-primary">
            Password reset link sent — check your email.
          </div>
          <Link href="/login" className="btn-ghost w-full block text-center">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="you@example.com"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-loss/30 bg-red-900/20 px-3 py-2 text-xs text-loss">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>

          <Link
            href="/login"
            className="block text-center text-xs text-text-secondary hover:text-text-primary"
          >
            ← Back to sign in
          </Link>
        </form>
      )}
    </div>
  );
}
