-- =============================================================================
-- VouchFX — Migration 029 · Sign-up provisioning hardening
--
-- Consolidates new-user provisioning into ONE resilient trigger and closes
-- gaps that left fresh accounts partially set up.
--
-- What this fixes:
--   1. "Database error saving new user" risk — the old trigger could abort the
--      whole auth signup if any INSERT raised. Provisioning is now wrapped so
--      a failure RAISEs a warning but NEVER blocks signup.
--   2. referral_code was set lazily (NULL until the user happened to visit a
--      page). It is now assigned deterministically at signup, matching the
--      app's codeFromUserId() (first 8 hex of the UUID, uppercased).
--   3. Trial subscription + affiliate account are created in the same place,
--      replacing the separate migration-012 trigger (dropped below) so there
--      is a single source of truth for "what a new user gets".
--   4. Validates users_auth_fk (was NOT VALID since 004) now that no spike
--      rows remain, making orphan profiles impossible.
--   5. Removes Phase-0 spike rows using the CORRECT ids (migration 017 used
--      ...0000; migration 002 actually seeded ...0001/0002/0003).
--
-- Idempotent and safe to re-run. Run in the Supabase SQL editor.
-- =============================================================================

-- ── 1. Consolidated, resilient new-user provisioning ─────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code TEXT := UPPER(LEFT(REPLACE(NEW.id::text, '-', ''), 8));
BEGIN
  -- Core profile row — the only thing sign-up truly requires. id + email are
  -- guaranteed by auth, so this cannot fail on data; ON CONFLICT covers retries.
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Referral code — isolated so a (astronomically unlikely) 8-hex collision on
  -- the UNIQUE constraint can never prevent the profile row from existing.
  BEGIN
    UPDATE public.users SET referral_code = v_code
    WHERE id = NEW.id AND referral_code IS NULL;
  EXCEPTION
    WHEN unique_violation THEN
      UPDATE public.users SET referral_code = UPPER(LEFT(REPLACE(NEW.id::text, '-', ''), 12))
      WHERE id = NEW.id AND referral_code IS NULL;
    WHEN OTHERS THEN
      RAISE WARNING 'handle_new_auth_user: referral_code for %: %', NEW.id, SQLERRM;
  END;

  -- 7-day trial subscription.
  BEGIN
    INSERT INTO public.subscriptions (user_id, plan, status, provider, trial_ends_at)
    VALUES (NEW.id, 'trial', 'trialing', 'manual', NOW() + INTERVAL '7 days')
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_auth_user: trial sub for %: %', NEW.id, SQLERRM;
  END;

  -- Affiliate account so the user can share a referral link immediately.
  BEGIN
    INSERT INTO public.affiliate_accounts (user_id, referral_code, referral_link_slug)
    SELECT NEW.id, u.referral_code, LOWER(u.referral_code)
    FROM public.users u WHERE u.id = NEW.id AND u.referral_code IS NOT NULL
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_auth_user: affiliate for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Last-resort guard: provisioning must NEVER block auth sign-up.
  RAISE WARNING 'handle_new_auth_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Trigger already exists from 004; recreate to be explicit and idempotent.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


-- ── 2. Retire the redundant migration-012 trial trigger ──────────────────────
-- The trial subscription is now created above; this avoids a second trigger
-- firing on every public.users insert.

DROP TRIGGER IF EXISTS trg_create_trial_subscription ON public.users;
DROP FUNCTION IF EXISTS public.fn_create_trial_subscription();


-- ── 3. Backfill existing users (idempotent) ──────────────────────────────────

UPDATE public.users
  SET referral_code = UPPER(LEFT(REPLACE(id::text, '-', ''), 8))
  WHERE referral_code IS NULL;

INSERT INTO public.affiliate_accounts (user_id, referral_code, referral_link_slug)
SELECT u.id, u.referral_code, LOWER(u.referral_code)
FROM public.users u
WHERE u.referral_code IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.affiliate_accounts a WHERE a.user_id = u.id)
ON CONFLICT DO NOTHING;

INSERT INTO public.subscriptions (user_id, plan, status, provider, trial_ends_at)
SELECT u.id, 'trial', 'trialing', 'manual', NOW() + INTERVAL '7 days'
FROM public.users u
WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id);


-- ── 4. Remove any Phase-0 spike rows (correct ids from seed 002) ─────────────

DELETE FROM public.signal_sources    WHERE id = '00000000-0000-0000-0000-000000000003';
DELETE FROM public.broker_connections WHERE id = '00000000-0000-0000-0000-000000000002';
DELETE FROM public.users
  WHERE id = '00000000-0000-0000-0000-000000000001' AND email = 'spike@vouchfx.dev';


-- ── 5. Validate the auth FK (now that no spike/orphan rows remain) ────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_auth_fk' AND table_name = 'users'
  ) THEN
    ALTER TABLE public.users VALIDATE CONSTRAINT users_auth_fk;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'could not validate users_auth_fk: %', SQLERRM;
END $$;
