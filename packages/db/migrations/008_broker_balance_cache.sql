-- Migration 008: cache last-known balance & equity on broker_connections
--
-- Populated by the executor after each signal job. The web dashboard reads
-- these values without needing to call MetaApi directly (which can't run in
-- a Vercel serverless context).

ALTER TABLE broker_connections
  ADD COLUMN IF NOT EXISTS last_balance_usd  NUMERIC,
  ADD COLUMN IF NOT EXISTS last_equity_usd   NUMERIC,
  ADD COLUMN IF NOT EXISTS last_synced_at    TIMESTAMPTZ;
