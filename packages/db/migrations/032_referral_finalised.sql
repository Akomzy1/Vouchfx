-- =============================================================================
-- VouchFX — Migration 032 · Finalised referral & affiliate model (PRD §6.11)
--
-- Backbone for VCH-REF-01..09. The commission_ledger (UNIQUE per payment) is
-- the structural guarantee against double-pay: a given payment can accrue at
-- most one commission, ever.
--
-- Model:
--   • referrals = the ONE attribution slot per user (UNIQUE referee_id already).
--     +source_type ('affiliate'=cash | 'referral'=credit), +locked_at,
--     +commission_until (affiliate 12-month cap, per referred user).
--   • commission_ledger = one row per collected payment that earns. Created in
--     'maturing' state (matures_at = paid_at + 14d). Promoted to 'matured' by
--     the sweep, which credits the beneficiary's cash or credit balance. A
--     refund flips the row to 'clawed_back' and reverses any credited balance.
--   • affiliate_accounts.credit_balance_usd = matured REFERRAL credit (cash is
--     the existing pending_payout_usd; locked_payout_usd from migration 031).
--
-- Idempotent + re-runnable. Run in the Supabase SQL editor.
-- =============================================================================

-- ── 1. Unified attribution columns on referrals ──────────────────────────────

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS source_type      TEXT,
  ADD COLUMN IF NOT EXISTS locked_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commission_until TIMESTAMPTZ;

-- Existing rows (if any) were the old single cash program → 'affiliate'.
UPDATE public.referrals SET source_type = 'affiliate' WHERE source_type IS NULL;

ALTER TABLE public.referrals
  ALTER COLUMN source_type SET DEFAULT 'referral',
  ALTER COLUMN source_type SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage
                 WHERE constraint_name = 'referrals_source_type_check') THEN
    ALTER TABLE public.referrals
      ADD CONSTRAINT referrals_source_type_check CHECK (source_type IN ('affiliate', 'referral'));
  END IF;
END $$;

-- Lock any pre-existing binds at their creation time.
UPDATE public.referrals SET locked_at = created_at WHERE locked_at IS NULL;


-- ── 2. credit balance (matured referral credit) ──────────────────────────────

ALTER TABLE public.affiliate_accounts
  ADD COLUMN IF NOT EXISTS credit_balance_usd NUMERIC NOT NULL DEFAULT 0
    CHECK (credit_balance_usd >= 0);


-- ── 3. commission_ledger ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.commission_ledger (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id       UUID        NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  referee_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  beneficiary_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind              TEXT        NOT NULL CHECK (kind IN ('cash', 'credit')),
  payment_reference TEXT        NOT NULL,
  gross_usd         NUMERIC     NOT NULL CHECK (gross_usd >= 0),
  amount_usd        NUMERIC     NOT NULL CHECK (amount_usd >= 0),
  status            TEXT        NOT NULL DEFAULT 'maturing'
                      CHECK (status IN ('maturing', 'matured', 'clawed_back')),
  accrued_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  matures_at        TIMESTAMPTZ NOT NULL,
  matured_at        TIMESTAMPTZ,
  clawed_back_at    TIMESTAMPTZ,
  -- one accrual per payment per kind — the anti-double-pay guarantee
  UNIQUE (payment_reference, kind)
);

CREATE INDEX IF NOT EXISTS commission_ledger_beneficiary_idx ON public.commission_ledger (beneficiary_id);
CREATE INDEX IF NOT EXISTS commission_ledger_sweep_idx ON public.commission_ledger (status, matures_at);

ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;
-- Beneficiaries may read their own ledger; all writes are service-role only.
CREATE POLICY "beneficiary reads own commission ledger"
  ON public.commission_ledger FOR SELECT USING (auth.uid() = beneficiary_id);


-- ── 4. fn_accrue_commission — idempotent accrual (no balance change) ──────────
-- Called once per collected payment. Resolves the referee's single attribution
-- slot, enforces the affiliate 12-month cap, and writes a 'maturing' ledger row.

CREATE OR REPLACE FUNCTION public.fn_accrue_commission(
  p_payment_reference TEXT,
  p_referee_id        UUID,
  p_gross_usd         NUMERIC
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref   referrals%ROWTYPE;
  v_kind  TEXT;
  v_rate  NUMERIC := 0.20;
BEGIN
  SELECT * INTO v_ref FROM referrals WHERE referee_id = p_referee_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;                 -- not referred → nobody earns
  IF v_ref.referrer_id = p_referee_id THEN RETURN; END IF; -- self-referral guard

  -- First collected payment: mark converted, start the per-user 12-month clock.
  IF v_ref.status = 'pending' OR v_ref.first_paid_at IS NULL THEN
    UPDATE referrals
       SET status = 'converted',
           first_paid_at = COALESCE(first_paid_at, now()),
           commission_until = COALESCE(commission_until, now() + INTERVAL '12 months')
     WHERE id = v_ref.id;
    v_ref.commission_until := COALESCE(v_ref.commission_until, now() + INTERVAL '12 months');
  END IF;

  v_kind := CASE WHEN v_ref.source_type = 'affiliate' THEN 'cash' ELSE 'credit' END;

  -- Affiliate cash stops after the 12-month per-user window (VCH-REF-01).
  -- Referral credit continues while subscribed (no 12-month cap).
  IF v_kind = 'cash' AND v_ref.commission_until IS NOT NULL AND now() > v_ref.commission_until THEN
    RETURN;
  END IF;

  -- Maturation gate: payable only after the 14-day refund window (VCH-REF-04).
  INSERT INTO commission_ledger
    (referral_id, referee_id, beneficiary_id, kind, payment_reference, gross_usd, amount_usd, matures_at)
  VALUES
    (v_ref.id, p_referee_id, v_ref.referrer_id, v_kind, p_payment_reference,
     p_gross_usd, ROUND(p_gross_usd * v_rate, 2), now() + INTERVAL '14 days')
  ON CONFLICT (payment_reference, kind) DO NOTHING;
END;
$$;


-- ── 5. fn_clawback_commission — refund/chargeback reversal ────────────────────

CREATE OR REPLACE FUNCTION public.fn_clawback_commission(
  p_payment_reference TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row commission_ledger%ROWTYPE;
BEGIN
  FOR v_row IN
    SELECT * FROM commission_ledger
     WHERE payment_reference = p_payment_reference AND status <> 'clawed_back'
     FOR UPDATE
  LOOP
    -- If it had already matured into a balance, reverse that balance.
    IF v_row.status = 'matured' THEN
      IF v_row.kind = 'cash' THEN
        UPDATE affiliate_accounts
           SET pending_payout_usd = GREATEST(0, pending_payout_usd - v_row.amount_usd)
         WHERE user_id = v_row.beneficiary_id;
      ELSE
        UPDATE affiliate_accounts
           SET credit_balance_usd = GREATEST(0, credit_balance_usd - v_row.amount_usd)
         WHERE user_id = v_row.beneficiary_id;
      END IF;
    END IF;
    UPDATE commission_ledger
       SET status = 'clawed_back', clawed_back_at = now()
     WHERE id = v_row.id;
  END LOOP;
END;
$$;


-- ── 5b. increment_affiliate_clicks — link-click counter (VCH-REF-02) ──────────

CREATE OR REPLACE FUNCTION public.increment_affiliate_clicks(p_code TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE affiliate_accounts
     SET total_clicks = total_clicks + 1
   WHERE referral_code = UPPER(p_code) OR referral_link_slug = LOWER(p_code);
$$;


-- ── 6. fn_settle_matured_commissions — promote matured rows into balances ─────
-- Idempotent sweep. Run on a schedule and before any balance read/payout.

CREATE OR REPLACE FUNCTION public.fn_settle_matured_commissions()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row commission_ledger%ROWTYPE;
  v_n   INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM commission_ledger
     WHERE status = 'maturing' AND now() >= matures_at
     FOR UPDATE SKIP LOCKED
  LOOP
    IF v_row.kind = 'cash' THEN
      UPDATE affiliate_accounts
         SET pending_payout_usd = pending_payout_usd + v_row.amount_usd
       WHERE user_id = v_row.beneficiary_id;
    ELSE
      UPDATE affiliate_accounts
         SET credit_balance_usd = credit_balance_usd + v_row.amount_usd
       WHERE user_id = v_row.beneficiary_id;
    END IF;
    UPDATE commission_ledger SET status = 'matured', matured_at = now() WHERE id = v_row.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;
