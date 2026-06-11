-- =============================================================================
-- VouchFX — Migration 014 · Onboarding state on users
-- • onboarding_completed_at: set when user clicks "Go live" (disclaimer accepted)
-- • demo_mode_enabled: user chose demo-first mode during onboarding
-- Run in the Supabase SQL editor.
-- =============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_mode_enabled        BOOLEAN NOT NULL DEFAULT false;
