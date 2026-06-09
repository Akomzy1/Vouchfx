-- =============================================================================
-- VouchFX — Migration 005 · Telegram auth pending state
--
-- Stores interim state for the multi-step phone+code connect flow.
-- Written and read only by server-side API routes (service role).
-- Rows are deleted immediately after auth completes or fails.
-- =============================================================================

CREATE TABLE IF NOT EXISTS telegram_auth_pending (
  user_id              UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone_number         TEXT        NOT NULL,
  phone_code_hash      TEXT        NOT NULL,
  -- Serialised GramJS StringSession captured after sendCode (contains the MTProto
  -- auth key so the verify step can re-connect to the same DC).
  session_data         TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: enabled with no user-facing policies — service role only.
-- Authenticated users must not be able to read raw phone_code_hash values.
ALTER TABLE telegram_auth_pending ENABLE ROW LEVEL SECURITY;
-- (No CREATE POLICY — all access is via service role which bypasses RLS.)

-- Auto-cleanup: stale pending rows older than 10 minutes are junk.
-- The application also deletes the row explicitly on success/failure.
-- A pg_cron job or Supabase scheduled function can run:
--   DELETE FROM telegram_auth_pending WHERE created_at < NOW() - INTERVAL '10 minutes';
