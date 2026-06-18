-- =============================================================================
-- VouchFX — Migration 035 · Asset-aware default SL (gold vs forex)
--
-- A single default_sl_pips can't fit both forex (fractions of a cent) and gold
-- (dollars). Add a separate gold/metals default. The existing default_sl_pips
-- now means the forex/general default; default_sl_pips_gold applies to
-- XAU/XAG/GOLD symbols.
--
-- Idempotent. Run in the Supabase SQL editor.
-- =============================================================================

ALTER TABLE public.risk_settings
  ADD COLUMN IF NOT EXISTS default_sl_pips_gold NUMERIC NOT NULL DEFAULT 150;
