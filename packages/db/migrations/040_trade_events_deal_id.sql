-- =============================================================================
-- VouchFX — Migration 040 · Deal-history sync idempotency (realised P&L)
--
-- trade_events was defined in 004 but NOTHING populated it — so the
-- Performance analytics (which sum trade_events.pnl) had no data, and trades
-- closed broker-side (TP/SL hit) were never detected at all.
--
-- The executor's new trade-sync job pulls closed deals from MetaApi and writes
-- one trade_events row per closing deal (pnl = profit + commission + swap in
-- account currency). deal_id makes that idempotent: re-fetching an overlapping
-- deal window can never double-record a close.
--
-- Idempotent. Run in the Supabase SQL editor after migration 039.
-- =============================================================================

ALTER TABLE public.trade_events
  ADD COLUMN IF NOT EXISTS deal_id TEXT;

COMMENT ON COLUMN public.trade_events.deal_id IS
  'Broker deal id (MetaApi) that produced this event — idempotency key for the trade-sync job; null for events not sourced from deal history.';

CREATE UNIQUE INDEX IF NOT EXISTS trade_events_trade_deal_uniq
  ON public.trade_events (trade_id, deal_id)
  WHERE deal_id IS NOT NULL;
