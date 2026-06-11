-- =============================================================================
-- VouchFX — Migration 011 · Paystack customer code on users
-- Run in the Supabase SQL editor.
-- =============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT UNIQUE;
