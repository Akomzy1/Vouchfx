-- =============================================================================
-- VouchFX — Migration 012 · Trial subscription auto-creation
-- Creates a trigger so every new user automatically gets a 7-day trialing row.
-- Also backfills any existing users who have no subscription yet.
-- Run in the Supabase SQL editor.
-- =============================================================================

-- ── Trigger function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_create_trial_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan, status, provider, trial_ends_at)
  VALUES (NEW.id, 'trial', 'trialing', 'manual', NOW() + INTERVAL '7 days')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── Trigger ───────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_create_trial_subscription ON public.users;

CREATE TRIGGER trg_create_trial_subscription
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.fn_create_trial_subscription();

-- ── Backfill existing users ───────────────────────────────────────────────────
-- Any user who signed up before this migration has no subscription row.
-- Give them a trial row that expires 7 days from now.

INSERT INTO public.subscriptions (user_id, plan, status, provider, trial_ends_at)
SELECT
  u.id,
  'trial',
  'trialing',
  'manual',
  NOW() + INTERVAL '7 days'
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id
);
