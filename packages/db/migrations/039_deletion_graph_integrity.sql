-- =============================================================================
-- VouchFX — Migration 039 · Complete the deletion graph (audit rows survive)
--
-- 038 made trades cascade from broker_connections, but the delete then hit
-- audit_events_trade_id_fkey: audit_events references trades (and
-- parsed_signals) with NO delete action, so removing an account — and the
-- kill-close hard-delete of a source — still fails with an FK violation.
--
-- Audit rows are append-only and must NEVER be deleted (migration 017), so
-- references DETACH instead: ON DELETE SET NULL. The audit payload keeps the
-- full context (symbol, reasons, broker response); only the dangling row
-- reference is nulled — same model as NFR-06's nullable referral references.
--
-- The 017 append-only trigger blocks ALL updates, including the FK's own
-- SET NULL, so it is updated to permit ONLY reference-detach updates (every
-- other column unchanged, references either unchanged or set to NULL).
--
-- Also completes the kill-close chain (source → parsed_signals → trades):
--   • trades.parsed_signal_id            → ON DELETE CASCADE
--   • parsed_signals.references_prior_signal_id → ON DELETE SET NULL
--
-- Idempotent. Run in the Supabase SQL editor after migration 038.
-- =============================================================================

-- ── 1. Append-only trigger: allow ONLY reference-detach updates ──────────────
CREATE OR REPLACE FUNCTION public.fn_audit_events_readonly()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.id         IS NOT DISTINCT FROM OLD.id
     AND NEW.user_id    IS NOT DISTINCT FROM OLD.user_id
     AND NEW.event_type IS NOT DISTINCT FROM OLD.event_type
     AND NEW.payload    IS NOT DISTINCT FROM OLD.payload
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND (NEW.trade_id         IS NOT DISTINCT FROM OLD.trade_id         OR NEW.trade_id IS NULL)
     AND (NEW.parsed_signal_id IS NOT DISTINCT FROM OLD.parsed_signal_id OR NEW.parsed_signal_id IS NULL)
  THEN
    -- FK ... ON DELETE SET NULL detaching a deleted trade/signal — permitted.
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only: % not permitted', TG_OP;
END;
$$;

-- ── 2. audit_events references detach on delete ──────────────────────────────
ALTER TABLE public.audit_events
  DROP CONSTRAINT IF EXISTS audit_events_trade_id_fkey;
ALTER TABLE public.audit_events
  ADD CONSTRAINT audit_events_trade_id_fkey
  FOREIGN KEY (trade_id) REFERENCES public.trades(id) ON DELETE SET NULL;

ALTER TABLE public.audit_events
  DROP CONSTRAINT IF EXISTS audit_events_parsed_signal_id_fkey;
ALTER TABLE public.audit_events
  ADD CONSTRAINT audit_events_parsed_signal_id_fkey
  FOREIGN KEY (parsed_signal_id) REFERENCES public.parsed_signals(id) ON DELETE SET NULL;

-- ── 3. Kill-close chain: parsed_signals delete reaches its trades ────────────
ALTER TABLE public.trades
  DROP CONSTRAINT IF EXISTS trades_parsed_signal_id_fkey;
ALTER TABLE public.trades
  ADD CONSTRAINT trades_parsed_signal_id_fkey
  FOREIGN KEY (parsed_signal_id) REFERENCES public.parsed_signals(id) ON DELETE CASCADE;

-- A follow-up referencing a deleted prior signal detaches rather than blocks.
ALTER TABLE public.parsed_signals
  DROP CONSTRAINT IF EXISTS parsed_signals_references_prior_signal_id_fkey;
ALTER TABLE public.parsed_signals
  ADD CONSTRAINT parsed_signals_references_prior_signal_id_fkey
  FOREIGN KEY (references_prior_signal_id) REFERENCES public.parsed_signals(id) ON DELETE SET NULL;
