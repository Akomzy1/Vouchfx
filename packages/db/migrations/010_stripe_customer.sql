-- =============================================================================
-- VouchFX — Migration 010 · Stripe customer ID on users
-- Run in the Supabase SQL editor.
-- =============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
