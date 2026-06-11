-- =============================================================================
-- VouchFX — Migration 016 · Worker heartbeats
-- • worker_heartbeats — one row per worker instance; upserted every 30s.
--   Used by the admin health view and Fly.io health checks to detect hung
--   processes before they become incidents.
-- Run in the Supabase SQL editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.worker_heartbeats (
  worker_id    TEXT PRIMARY KEY,
  worker_type  TEXT NOT NULL CHECK (worker_type IN ('listener', 'executor')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata     JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin-only; no RLS (service role only, never user-facing).
-- If you add RLS later, scope to is_admin on users.

COMMENT ON TABLE public.worker_heartbeats IS
  'Heartbeat pings from listener/executor workers. Stale > 60s = unhealthy.';
