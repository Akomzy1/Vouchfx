-- Migration 023: Execution mode for risk_settings
-- Adds the three columns that back VCH-RSK-09..12 (Mirror provider exactly).
--
-- execution_mode:    'apply_my_rules' (default) | 'mirror_provider'
-- mirror_lot_mode:   how to size volume in mirror mode
-- mirror_allow_no_sl: explicit opt-in to allow executing signals without a SL

ALTER TABLE public.risk_settings
  ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'apply_my_rules'
    CONSTRAINT risk_settings_execution_mode_check
      CHECK (execution_mode IN ('apply_my_rules', 'mirror_provider')),

  ADD COLUMN IF NOT EXISTS mirror_lot_mode TEXT NOT NULL DEFAULT 'risk_based'
    CONSTRAINT risk_settings_mirror_lot_mode_check
      CHECK (mirror_lot_mode IN ('provider_lot', 'fixed_lot', 'risk_based')),

  ADD COLUMN IF NOT EXISTS mirror_allow_no_sl BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.risk_settings.execution_mode    IS 'apply_my_rules: use risk settings for sizing; mirror_provider: copy provider SL/TP as-is';
COMMENT ON COLUMN public.risk_settings.mirror_lot_mode   IS 'Volume sizing mode when execution_mode = mirror_provider';
COMMENT ON COLUMN public.risk_settings.mirror_allow_no_sl IS 'When true, mirror-mode signals with no SL are executed rather than skipped';
