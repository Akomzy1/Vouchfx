-- =============================================================================
-- Migration 003 — Drop single-active-trade-per-signal index
--
-- The partial unique index added in 001 ("trades_one_active_per_signal") allows
-- at most ONE row with status PENDING or OPEN per parsed_signal_id. This blocks
-- multi-TP signals, which intentionally produce one trade row per TP leg.
--
-- P0.6 removes the index. Idempotency for new signals is enforced by the executor
-- pre-checking (SELECT COUNT) before inserting any legs. BullMQ job-ID deduplication
-- is the primary guard; the SELECT is the safety net.
-- P1.13 will harden this with MetaApi client-supplied request IDs and state
-- reconciliation on restart.
-- =============================================================================

DROP INDEX IF EXISTS trades_one_active_per_signal;
