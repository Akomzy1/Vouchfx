-- =============================================================================
-- VouchFX — Migration 041 · Non-partial unique index for deal idempotency
--
-- 040 created the (trade_id, deal_id) unique index as PARTIAL
-- (WHERE deal_id IS NOT NULL), but Postgres cannot infer a partial index as an
-- ON CONFLICT arbiter unless the conflict target repeats the predicate — which
-- supabase-js upserts cannot express. The trade-sync upsert therefore failed:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
--
-- A plain unique index has identical semantics here: Postgres treats NULLs as
-- distinct in unique indexes, so events without a deal_id (non-deal-sourced)
-- remain unlimited per trade, while (trade_id, deal_id) pairs stay unique.
--
-- Idempotent. Run in the Supabase SQL editor after migration 040.
-- =============================================================================

DROP INDEX IF EXISTS trade_events_trade_deal_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS trade_events_trade_deal_uniq
  ON public.trade_events (trade_id, deal_id);
