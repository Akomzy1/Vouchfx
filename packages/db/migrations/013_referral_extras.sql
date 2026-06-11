-- =============================================================================
-- VouchFX — Migration 013 · Referral extras
-- • first_month_discount_applied column on referrals
-- • RPC helpers for atomic commission accrual/clawback and signup counting
-- Run in the Supabase SQL editor.
-- =============================================================================

-- ── Schema addition ───────────────────────────────────────────────────────────

ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS first_month_discount_applied BOOLEAN NOT NULL DEFAULT false;

-- ── RPC: increment_affiliate_signups ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_affiliate_signups(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE affiliate_accounts
     SET total_signups = total_signups + 1
   WHERE user_id = p_user_id;
END;
$$;

-- ── RPC: accrue_affiliate_commission ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.accrue_affiliate_commission(
  p_user_id         UUID,
  p_commission_usd  NUMERIC,
  p_first_conversion BOOLEAN
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE affiliate_accounts
     SET pending_payout_usd     = pending_payout_usd + p_commission_usd,
         total_active_referrals = total_active_referrals + CASE WHEN p_first_conversion THEN 1 ELSE 0 END
   WHERE user_id = p_user_id;
END;
$$;

-- ── RPC: clawback_affiliate_commission ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.clawback_affiliate_commission(
  p_user_id        UUID,
  p_commission_usd NUMERIC
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE affiliate_accounts
     SET pending_payout_usd = GREATEST(0, pending_payout_usd - p_commission_usd)
   WHERE user_id = p_user_id;
END;
$$;
