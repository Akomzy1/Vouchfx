-- Migration 027: Remove demo-first mode (product decision, PRD R6)
--
-- VouchFX treats demo and live MT5 accounts identically — users test by
-- connecting their broker's demo account. Channel status is Live or Paused
-- only. trades.is_simulated is kept for historical paper-trade rows; no new
-- simulated trades are created.
--
-- Adds broker_connections.account_mode so the UI can show a demo/live badge,
-- derived from MetaApi account information (ACCOUNT_TRADE_MODE_*) and cached
-- by the executor alongside the balance.

ALTER TABLE public.signal_sources DROP COLUMN IF EXISTS demo_until;
ALTER TABLE public.users          DROP COLUMN IF EXISTS demo_mode_enabled;

ALTER TABLE public.broker_connections
  ADD COLUMN IF NOT EXISTS account_mode TEXT
    CONSTRAINT broker_connections_account_mode_check
      CHECK (account_mode IN ('demo', 'live'));

COMMENT ON COLUMN public.broker_connections.account_mode IS 'demo | live — from MetaApi account info (ACCOUNT_TRADE_MODE_*); null until first sync';
