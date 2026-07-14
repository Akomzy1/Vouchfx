-- =============================================================================
-- VouchFX — Migration 042 · Breakeven at 1R
--
-- Adds risk_settings.breakeven_at_1r: when enabled, the executor's breakeven
-- watch moves an open trade's stop loss to its entry price once price has
-- moved in the trade's favour by the trade's own SL distance (1R). Complements
-- breakeven_after_tp1 (which triggers on the first TP leg closing) — this
-- trigger is price-based, so it also protects single-leg / no-TP trades.
--
-- Run in the Supabase SQL editor after migration 041.
-- =============================================================================

ALTER TABLE public.risk_settings
  ADD COLUMN IF NOT EXISTS breakeven_at_1r BOOLEAN NOT NULL DEFAULT false;
