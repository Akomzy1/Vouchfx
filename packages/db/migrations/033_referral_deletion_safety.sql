-- =============================================================================
-- VouchFX — Migration 033 · Referral/ledger account-deletion safety (NFR-06)
--
-- Goal: deleting a user removes their PERSONAL data but never destroys
-- financial/audit records or a counterparty's earned money.
--
--   • referrals.referrer_id / referee_id  → NULLABLE, ON DELETE SET NULL
--     (detach-and-retain: the referral row survives for audit, the personal
--      link is anonymised).
--   • commission_ledger.referee_id / beneficiary_id → NULLABLE, ON DELETE SET
--     NULL (ledger rows — earned/pending/paid amounts — are NEVER deleted by a
--     user deletion; they are detached and retained).
--   • commission_ledger.referral_id → ON DELETE RESTRICT (a ledger row can
--     never be orphaned/destroyed by deleting its referral row either).
--   • payouts.user_id / affiliate_account_id → NULLABLE, ON DELETE SET NULL
--     (payout history is a financial record; retained + detached).
--
-- The owed-balance BLOCK (don't delete a user who is owed cash) is enforced in
-- application code before deletion; this migration guarantees that whatever IS
-- deleted can never take the money trail with it.
--
-- NOTE: affiliate_accounts still cascades with the user (it is the user's own
-- balance row); the app blocks deletion while a cash balance is owed, and the
-- commission_ledger preserves the historical financial trail regardless.
--
-- Idempotent. Run in the Supabase SQL editor.
-- =============================================================================

-- ── 1. Drop the existing FK constraints on the affected columns (any name) ────

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tc.constraint_name, tc.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      AND (
        (tc.table_name = 'referrals'          AND kcu.column_name IN ('referrer_id', 'referee_id')) OR
        (tc.table_name = 'commission_ledger'  AND kcu.column_name IN ('referee_id', 'beneficiary_id', 'referral_id')) OR
        (tc.table_name = 'payouts'            AND kcu.column_name IN ('user_id', 'affiliate_account_id'))
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
  END LOOP;
END $$;

-- ── 2. Make the link columns nullable (detach instead of block/cascade) ───────

ALTER TABLE public.referrals         ALTER COLUMN referrer_id        DROP NOT NULL;
ALTER TABLE public.referrals         ALTER COLUMN referee_id         DROP NOT NULL;
ALTER TABLE public.commission_ledger ALTER COLUMN referee_id         DROP NOT NULL;
ALTER TABLE public.commission_ledger ALTER COLUMN beneficiary_id     DROP NOT NULL;
ALTER TABLE public.payouts           ALTER COLUMN user_id            DROP NOT NULL;
ALTER TABLE public.payouts           ALTER COLUMN affiliate_account_id DROP NOT NULL;

-- ── 3. Recreate FKs with money-safe delete behaviour ──────────────────────────

-- referrals: detach the personal link, keep the row for audit.
ALTER TABLE public.referrals
  ADD CONSTRAINT referrals_referrer_id_fkey
    FOREIGN KEY (referrer_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.referrals
  ADD CONSTRAINT referrals_referee_id_fkey
    FOREIGN KEY (referee_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- commission_ledger: financial records — detached, never deleted.
ALTER TABLE public.commission_ledger
  ADD CONSTRAINT commission_ledger_referee_id_fkey
    FOREIGN KEY (referee_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.commission_ledger
  ADD CONSTRAINT commission_ledger_beneficiary_id_fkey
    FOREIGN KEY (beneficiary_id) REFERENCES public.users(id) ON DELETE SET NULL;
-- A ledger row can never be destroyed by deleting its referral row.
ALTER TABLE public.commission_ledger
  ADD CONSTRAINT commission_ledger_referral_id_fkey
    FOREIGN KEY (referral_id) REFERENCES public.referrals(id) ON DELETE RESTRICT;

-- payouts: financial records — detached, retained.
ALTER TABLE public.payouts
  ADD CONSTRAINT payouts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.payouts
  ADD CONSTRAINT payouts_affiliate_account_id_fkey
    FOREIGN KEY (affiliate_account_id) REFERENCES public.affiliate_accounts(id) ON DELETE SET NULL;
