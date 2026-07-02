-- =============================================================================
-- VouchFX — Migration 037 · Per-account signal copying (multi-account fan-out)
--
-- Adds broker_connections.copy_enabled so a trader chooses WHICH connected
-- accounts a signal copies to (all / selected / one). The listener enqueues one
-- job per copy-enabled active account; each account's trades, follow-ups and
-- cancels are scoped by broker_connection_id in the executor.
--
-- Default TRUE: a NEWLY connected account copies signals by default.
--
-- BACKFILL preserves today's behaviour for EXISTING users. Before this feature a
-- signal only went to ONE account per user — the primary, else the oldest active
-- (listener pool.ts ordered is_primary DESC, created_at ASC and kept the first).
-- So we turn copy_enabled OFF for every active account EXCEPT that one per user;
-- the previously-trading account stays ON. Users opt others in via the UI.
--
-- Idempotent. Run in the Supabase SQL editor after migration 036.
-- =============================================================================

ALTER TABLE public.broker_connections
  ADD COLUMN IF NOT EXISTS copy_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.broker_connections.copy_enabled IS
  'Whether new signals copy to this account (VCH-BRK-04 multi-account). Default true; the listener fans out one job per copy-enabled active account.';

-- Backfill: demote every active account that was NOT the one previously trading.
-- (Runs once; safe to re-run — it only ever re-asserts the same single winner.)
UPDATE public.broker_connections
SET copy_enabled = FALSE
WHERE is_active = TRUE
  AND id NOT IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY user_id
               ORDER BY is_primary DESC, created_at ASC
             ) AS rn
      FROM public.broker_connections
      WHERE is_active = TRUE
    ) ranked
    WHERE ranked.rn = 1
  );

-- Listener fetches active accounts (with their copy_enabled flag) per user on
-- connect/resync to decide fan-out.
CREATE INDEX IF NOT EXISTS broker_connections_active_user_idx
  ON public.broker_connections (user_id)
  WHERE is_active = TRUE;
