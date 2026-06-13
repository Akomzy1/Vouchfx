-- =============================================================================
-- VouchFX — Migration 031 · Admin console + payout balance safety (PRD §6.14)
--
-- 1. 'admin' role in user_roles + is_admin() helper (VCH-ADMIN-01).
-- 2. Payout balance safety (VCH-ADMIN-03): a payout request no longer ZEROES
--    the affiliate's pending balance. The amount moves pending -> locked, and
--    is only cleared on PAID (or returned to pending on FAILED). Atomic RPCs
--    enforce this so balances can never be lost to a race or a failed payout.
-- 3. Audit columns on payouts (who processed it, why it failed).
-- 4. Backfill any orphaned in-flight payout rows created by the old (buggy)
--    flow so their amounts are tracked as locked rather than lost.
--
-- Idempotent. Run in the Supabase SQL editor.
-- =============================================================================

-- ── 1. admin role ─────────────────────────────────────────────────────────────

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check CHECK (role IN ('rule_approver', 'admin'));

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;


-- ── 2. payout balance columns ─────────────────────────────────────────────────

ALTER TABLE public.affiliate_accounts
  ADD COLUMN IF NOT EXISTS locked_payout_usd NUMERIC NOT NULL DEFAULT 0
    CHECK (locked_payout_usd >= 0);

ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS processed_by   TEXT,   -- admin email who actioned it
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;


-- ── 3. fn_request_payout — atomic pending -> locked + insert ──────────────────
-- Replaces the old route logic that zeroed pending_payout_usd outright.
-- Returns the new payout id, or raises if the balance is insufficient.

CREATE OR REPLACE FUNCTION public.fn_request_payout(
  p_user_id UUID,
  p_amount  NUMERIC,
  p_method  TEXT
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_aff   affiliate_accounts%ROWTYPE;
  v_id    UUID;
BEGIN
  SELECT * INTO v_aff FROM affiliate_accounts WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_affiliate_account'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF v_aff.pending_payout_usd < p_amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  UPDATE affiliate_accounts
     SET pending_payout_usd = pending_payout_usd - p_amount,
         locked_payout_usd  = locked_payout_usd  + p_amount,
         payout_method      = p_method
   WHERE id = v_aff.id;

  INSERT INTO payouts (affiliate_account_id, user_id, amount_usd, status, method)
  VALUES (v_aff.id, p_user_id, p_amount, 'pending', p_method)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


-- ── 4. fn_settle_payout — atomic admin transition with balance moves ──────────
-- approve : pending -> processing            (no balance change; still locked)
-- paid    : pending|processing -> paid       (locked -= amount; money is gone)
-- failed  : pending|processing -> failed     (locked -= amount; pending += amount)

CREATE OR REPLACE FUNCTION public.fn_settle_payout(
  p_payout_id      UUID,
  p_new_status     TEXT,
  p_reference      TEXT,
  p_processed_by   TEXT,
  p_failure_reason TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payout payouts%ROWTYPE;
BEGIN
  SELECT * INTO v_payout FROM payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payout_not_found'; END IF;
  IF v_payout.status NOT IN ('pending', 'processing') THEN
    RAISE EXCEPTION 'payout_already_settled: %', v_payout.status;
  END IF;

  IF p_new_status = 'processing' THEN
    UPDATE payouts SET status = 'processing', processed_by = p_processed_by
     WHERE id = p_payout_id;

  ELSIF p_new_status = 'paid' THEN
    UPDATE payouts
       SET status = 'paid', provider_transfer_id = p_reference,
           processed_by = p_processed_by, paid_at = now()
     WHERE id = p_payout_id;
    UPDATE affiliate_accounts
       SET locked_payout_usd = GREATEST(0, locked_payout_usd - v_payout.amount_usd),
           lifetime_paid_usd  = lifetime_paid_usd + v_payout.amount_usd
     WHERE id = v_payout.affiliate_account_id;

  ELSIF p_new_status = 'failed' THEN
    UPDATE payouts
       SET status = 'failed', failure_reason = p_failure_reason, processed_by = p_processed_by
     WHERE id = p_payout_id;
    UPDATE affiliate_accounts
       SET locked_payout_usd  = GREATEST(0, locked_payout_usd - v_payout.amount_usd),
           pending_payout_usd = pending_payout_usd + v_payout.amount_usd
     WHERE id = v_payout.affiliate_account_id;

  ELSE
    RAISE EXCEPTION 'invalid_status: %', p_new_status;
  END IF;
END;
$$;


-- ── 5. Backfill orphaned in-flight payouts ────────────────────────────────────
-- The old flow zeroed pending_payout_usd on request and never restored it, so
-- any still-open payout's amount is currently untracked. Record those amounts
-- as locked so PAID/FAILED settlement adjusts a real balance. Safe + idempotent:
-- we only raise locked to cover in-flight rows it doesn't already cover.

UPDATE affiliate_accounts a
   SET locked_payout_usd = GREATEST(a.locked_payout_usd, inflight.total)
  FROM (
    SELECT affiliate_account_id, SUM(amount_usd) AS total
      FROM payouts
     WHERE status IN ('pending', 'processing')
     GROUP BY affiliate_account_id
  ) AS inflight
 WHERE a.id = inflight.affiliate_account_id;
