-- =============================================================================
-- VouchFX — Migration 021 · Prop account profile extras (Phase 2, P2.9)
--
-- Adds:
--   stealth_config              JSONB — stealth execution settings per account
--   challenge_start_balance_usd NUMERIC — the initial challenge balance (for
--                                         static drawdown model floor calculation)
--
-- Both are optional; executor falls back to DEFAULT_STEALTH_CONFIG if null,
-- and risk engine skips static-model floor if null.
-- =============================================================================

ALTER TABLE public.prop_account_profiles
  ADD COLUMN IF NOT EXISTS stealth_config              JSONB,
  ADD COLUMN IF NOT EXISTS challenge_start_balance_usd NUMERIC(15,2);
