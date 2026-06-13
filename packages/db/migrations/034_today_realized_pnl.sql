-- =============================================================================
-- VouchFX — Migration 034 · Cache today's realized P&L per broker
--
-- The dashboard shows Floating P&L (equity − balance, unrealized) already.
-- This adds a genuine "Today's P&L" = sum of profit from deals closed since
-- 00:00 UTC, cached by the executor's balance-sync job. today_pnl_date guards
-- staleness so the dashboard only shows it when it's actually for today.
--
-- Idempotent. Run in the Supabase SQL editor.
-- =============================================================================

ALTER TABLE public.broker_connections
  ADD COLUMN IF NOT EXISTS today_realized_pnl_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS today_pnl_date         DATE;
