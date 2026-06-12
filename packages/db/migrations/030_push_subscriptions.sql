-- =============================================================================
-- VouchFX — Migration 030 · Web Push subscriptions (PWA, VCH-PWA-03)
--
-- Adds web push as a THIRD notification channel alongside in-app + email,
-- gated by the SAME per-event preference rows (notification_preferences).
--
-- Run in the Supabase SQL editor.
-- =============================================================================

-- ── push channel toggle on the existing per-event preferences ────────────────
-- Missing rows default to enabled (matches in_app/email semantics in notify()).

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN NOT NULL DEFAULT true;


-- ── push_subscriptions ───────────────────────────────────────────────────────
-- One row per browser/device (a Web Push endpoint). A user may have many.
-- endpoint is globally unique (the push service URL identifies the device).
-- p256dh + auth are the client's public encryption keys (NOT secrets of ours);
-- they are required to encrypt each push payload per RFC 8291.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint     TEXT        NOT NULL UNIQUE,
  p256dh       TEXT        NOT NULL,
  auth         TEXT        NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users manage their own devices from Settings. The workers send and prune
-- stale subscriptions via the service role, which bypasses RLS.
CREATE POLICY "Users read own push subscriptions"
  ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own push subscriptions"
  ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own push subscriptions"
  ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);
