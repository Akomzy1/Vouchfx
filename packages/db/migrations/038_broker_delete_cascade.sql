-- =============================================================================
-- VouchFX — Migration 038 · Allow broker-account removal when trades exist
--
-- trades.broker_connection_id (001) is the ONLY broker_connections FK without
-- ON DELETE CASCADE (the prop tables from 018/020 all cascade). Removing an
-- account that has trade rows therefore failed with a foreign-key violation —
-- the Settings "remove account" button 500'd and the row reappeared on refresh.
--
-- Cascade matches the codebase's established hard-delete semantics (kill-close
-- hard-deletes sources, cascading parsed_signals → trades): removing a broker
-- account removes its trade rows (and their trade_events via the existing
-- trades cascade). VCH-BRK-06: deletion undeploys/removes the account.
--
-- Idempotent. Run in the Supabase SQL editor after migration 037.
-- =============================================================================

ALTER TABLE public.trades
  DROP CONSTRAINT IF EXISTS trades_broker_connection_id_fkey;

ALTER TABLE public.trades
  ADD CONSTRAINT trades_broker_connection_id_fkey
  FOREIGN KEY (broker_connection_id)
  REFERENCES public.broker_connections(id)
  ON DELETE CASCADE;
