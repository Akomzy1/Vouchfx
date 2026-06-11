-- =============================================================================
-- VouchFX — Migration 015 · Demo-first mode
-- • signal_sources.demo_until     — paper-trade until this timestamp; null = live
-- • trades.is_simulated           — paper trade, never placed on broker
-- Run in the Supabase SQL editor.
-- =============================================================================

ALTER TABLE signal_sources
  ADD COLUMN IF NOT EXISTS demo_until TIMESTAMPTZ;

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN NOT NULL DEFAULT false;
