-- =============================================================================
-- VouchFX — Migration 004 · Phase 1 schema + Auth + RLS
--
-- Run this in the Supabase SQL editor (or via supabase db push).
-- Then in the Supabase dashboard:
--   Authentication → Providers → enable Email + Google
--   Authentication → URL Configuration → set Site URL + redirect URLs
--
-- Order:
--   1. Extend users table (profile columns + auth FK + auto-create trigger)
--   2. New tables: telegram_sessions, risk_settings, trade_events,
--                  subscriptions, referrals, affiliate_accounts, payouts
--   3. Enable RLS + policies on every table
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EXTEND users
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS full_name   TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url  TEXT,
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- Link users.id → auth.users.id.
-- NOT VALID: skips checking the Phase-0 spike row (00000000-...) which has no
-- matching auth.users entry. Remove the spike row before going to production.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_auth_fk' AND table_name = 'users'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_auth_fk
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

-- Auto-create a public.users profile when someone signs up via Supabase Auth.
-- SECURITY DEFINER so the function can write to public.users regardless of RLS.
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. NEW TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- ── telegram_sessions ─────────────────────────────────────────────────────────
-- One encrypted GramJS session string per user.
-- session_string_encrypted: AES-256-GCM ciphertext (base64 encoded).
-- Decrypted only in worker memory JIT; never logged, never put in queues.
-- P1.3 adds encryption_key_id referencing Supabase Vault.

CREATE TABLE IF NOT EXISTS telegram_sessions (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_string_encrypted TEXT        NOT NULL,
  api_id                   INTEGER     NOT NULL,
  api_hash_hint            TEXT,           -- first 4 chars only — for debugging; never the full hash
  status                   TEXT        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'limited', 'banned', 'disconnected')),
  last_connected_at        TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)                         -- one session per user for MVP
);

CREATE TRIGGER trg_telegram_sessions_updated_at
  BEFORE UPDATE ON telegram_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── risk_settings ─────────────────────────────────────────────────────────────
-- One row per user; created with sensible defaults on signup.

CREATE TABLE IF NOT EXISTS risk_settings (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Position sizing (risk-engine skill: sizing mode)
  sizing_mode             TEXT        NOT NULL DEFAULT 'percent_balance'
                            CHECK (sizing_mode IN ('percent_balance', 'fixed_lot', 'fixed_usd_risk')),
  risk_per_trade_pct      NUMERIC     NOT NULL DEFAULT 0.5
                            CHECK (risk_per_trade_pct > 0 AND risk_per_trade_pct <= 10),
  fixed_lot_size          NUMERIC     CHECK (fixed_lot_size > 0),
  fixed_usd_risk          NUMERIC     CHECK (fixed_usd_risk > 0),

  -- Daily signal + trade caps
  daily_signal_limit      INT         NOT NULL DEFAULT 5  CHECK (daily_signal_limit > 0),
  max_trades_per_day      INT         CHECK (max_trades_per_day > 0),

  -- Drawdown guardian
  daily_loss_cap_pct      NUMERIC     CHECK (daily_loss_cap_pct > 0 AND daily_loss_cap_pct <= 100),
  daily_loss_cap_action   TEXT        NOT NULL DEFAULT 'pause'
                            CHECK (daily_loss_cap_action IN ('pause', 'pause_and_close')),

  -- Default SL policy (when a signal has no stop loss)
  default_sl_policy       TEXT        NOT NULL DEFAULT 'skip'
                            CHECK (default_sl_policy IN ('apply_default', 'skip', 'ask')),
  default_sl_pips         NUMERIC     CHECK (default_sl_pips > 0),

  -- Automation
  breakeven_after_tp1     BOOLEAN     NOT NULL DEFAULT FALSE,
  trailing_after_tp2      BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id)
);

CREATE TRIGGER trg_risk_settings_updated_at
  BEFORE UPDATE ON risk_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── trade_events ──────────────────────────────────────────────────────────────
-- Granular events per trade leg: TP/SL hits, partial closes, modifications.
-- Append-only. Drives P1.18 signal detail / audit log.

CREATE TABLE IF NOT EXISTS trade_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id    UUID        NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL
                CHECK (event_type IN (
                  'opened', 'tp_hit', 'sl_hit',
                  'closed_partial', 'closed_full', 'cancelled',
                  'modified_sl', 'modified_tp', 'moved_to_be'
                )),
  price       NUMERIC,        -- fill or touch price
  volume      NUMERIC,        -- lots affected
  pnl         NUMERIC,        -- realised P&L in account currency (positive or negative)
  payload     JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Append-only: no updated_at, no UPDATE/DELETE policies.
);

CREATE INDEX IF NOT EXISTS trade_events_trade_idx ON trade_events (trade_id);
CREATE INDEX IF NOT EXISTS trade_events_user_idx  ON trade_events (user_id);

-- ── subscriptions ─────────────────────────────────────────────────────────────
-- Current subscription state per user. One row; updated by Stripe/Paystack webhooks.

CREATE TABLE IF NOT EXISTS subscriptions (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan                     TEXT        NOT NULL
                             CHECK (plan IN ('trial', 'starter', 'pro', 'funded', 'lifetime')),
  status                   TEXT        NOT NULL
                             CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  provider                 TEXT        NOT NULL
                             CHECK (provider IN ('stripe', 'paystack', 'manual')),
  provider_subscription_id TEXT,           -- Stripe sub id or Paystack reference
  provider_customer_id     TEXT,
  current_period_start     TIMESTAMPTZ,
  current_period_end       TIMESTAMPTZ,
  trial_ends_at            TIMESTAMPTZ,
  cancelled_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── referrals ─────────────────────────────────────────────────────────────────
-- Last-touch attribution: each user can be referred by exactly one referrer.

CREATE TABLE IF NOT EXISTS referrals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   UUID        NOT NULL REFERENCES users(id),
  referee_id    UUID        NOT NULL REFERENCES users(id),
  referral_code TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'converted', 'churned')),
  first_paid_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referee_id)               -- each user referred at most once
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_id);

-- ── affiliate_accounts ────────────────────────────────────────────────────────
-- Signal-channel providers who earn 20% recurring on referred subscribers.

CREATE TABLE IF NOT EXISTS affiliate_accounts (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_code              TEXT        NOT NULL UNIQUE,
  referral_link_slug         TEXT        NOT NULL UNIQUE,
  -- Aggregate stats (updated by webhook jobs — not computed at query time)
  total_clicks               INT         NOT NULL DEFAULT 0,
  total_signups              INT         NOT NULL DEFAULT 0,
  total_active_referrals     INT         NOT NULL DEFAULT 0,
  pending_payout_usd         NUMERIC     NOT NULL DEFAULT 0 CHECK (pending_payout_usd >= 0),
  lifetime_paid_usd          NUMERIC     NOT NULL DEFAULT 0 CHECK (lifetime_paid_usd >= 0),
  -- Payout method (P1.24)
  payout_method              TEXT        CHECK (payout_method IN ('stripe', 'paystack', 'bank_transfer')),
  payout_details_encrypted   TEXT,       -- AES-256-GCM encrypted payout account details
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TRIGGER trg_affiliate_accounts_updated_at
  BEFORE UPDATE ON affiliate_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── payouts ───────────────────────────────────────────────────────────────────
-- One row per disbursement to an affiliate. $50 minimum per PRD §6.11.

CREATE TABLE IF NOT EXISTS payouts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_account_id  UUID        NOT NULL REFERENCES affiliate_accounts(id),
  user_id               UUID        NOT NULL REFERENCES users(id),
  amount_usd            NUMERIC     NOT NULL CHECK (amount_usd > 0),
  status                TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
  method                TEXT        NOT NULL
                          CHECK (method IN ('stripe', 'paystack', 'bank_transfer')),
  provider_transfer_id  TEXT,
  paid_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_payouts_updated_at
  BEFORE UPDATE ON payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS payouts_affiliate_idx ON payouts (affiliate_account_id);
CREATE INDEX IF NOT EXISTS payouts_user_idx      ON payouts (user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ROW-LEVEL SECURITY — every table, scoped to auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
-- Workers (listener, executor) use the service-role key → bypass RLS.
-- User-facing queries use the anon/authenticated JWT → governed by these policies.

-- Helper: drop existing policies before recreating (safe to re-run)
DO $$ BEGIN
  -- users
  DROP POLICY IF EXISTS "users_select_own"          ON users;
  DROP POLICY IF EXISTS "users_update_own"          ON users;
  -- broker_connections
  DROP POLICY IF EXISTS "broker_connections_select" ON broker_connections;
  DROP POLICY IF EXISTS "broker_connections_insert" ON broker_connections;
  DROP POLICY IF EXISTS "broker_connections_update" ON broker_connections;
  DROP POLICY IF EXISTS "broker_connections_delete" ON broker_connections;
  -- signal_sources
  DROP POLICY IF EXISTS "signal_sources_select"     ON signal_sources;
  DROP POLICY IF EXISTS "signal_sources_insert"     ON signal_sources;
  DROP POLICY IF EXISTS "signal_sources_update"     ON signal_sources;
  DROP POLICY IF EXISTS "signal_sources_delete"     ON signal_sources;
  -- parsed_signals
  DROP POLICY IF EXISTS "parsed_signals_select"     ON parsed_signals;
  -- trades
  DROP POLICY IF EXISTS "trades_select"             ON trades;
  -- audit_events
  DROP POLICY IF EXISTS "audit_events_select"       ON audit_events;
  -- telegram_sessions
  DROP POLICY IF EXISTS "telegram_sessions_select"  ON telegram_sessions;
  DROP POLICY IF EXISTS "telegram_sessions_insert"  ON telegram_sessions;
  DROP POLICY IF EXISTS "telegram_sessions_update"  ON telegram_sessions;
  DROP POLICY IF EXISTS "telegram_sessions_delete"  ON telegram_sessions;
  -- risk_settings
  DROP POLICY IF EXISTS "risk_settings_select"      ON risk_settings;
  DROP POLICY IF EXISTS "risk_settings_insert"      ON risk_settings;
  DROP POLICY IF EXISTS "risk_settings_update"      ON risk_settings;
  -- trade_events
  DROP POLICY IF EXISTS "trade_events_select"       ON trade_events;
  -- subscriptions
  DROP POLICY IF EXISTS "subscriptions_select"      ON subscriptions;
  -- referrals
  DROP POLICY IF EXISTS "referrals_select_referrer" ON referrals;
  DROP POLICY IF EXISTS "referrals_select_referee"  ON referrals;
  -- affiliate_accounts
  DROP POLICY IF EXISTS "affiliate_accounts_select" ON affiliate_accounts;
  DROP POLICY IF EXISTS "affiliate_accounts_update" ON affiliate_accounts;
  -- payouts
  DROP POLICY IF EXISTS "payouts_select"            ON payouts;
END $$;

-- ── users ─────────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id);
-- INSERT handled by the handle_new_auth_user() trigger (SECURITY DEFINER)
-- DELETE not exposed — account deletion is an admin/webhook operation

-- ── broker_connections ────────────────────────────────────────────────────────
ALTER TABLE broker_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "broker_connections_select" ON broker_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "broker_connections_insert" ON broker_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "broker_connections_update" ON broker_connections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "broker_connections_delete" ON broker_connections FOR DELETE USING (auth.uid() = user_id);

-- ── signal_sources ────────────────────────────────────────────────────────────
ALTER TABLE signal_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signal_sources_select" ON signal_sources FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "signal_sources_insert" ON signal_sources FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "signal_sources_update" ON signal_sources FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "signal_sources_delete" ON signal_sources FOR DELETE USING (auth.uid() = user_id);

-- ── parsed_signals ────────────────────────────────────────────────────────────
-- No user_id column — ownership is source_id → signal_sources → user_id.
ALTER TABLE parsed_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parsed_signals_select" ON parsed_signals FOR SELECT USING (
  source_id IN (SELECT id FROM signal_sources WHERE user_id = auth.uid())
);
-- INSERT/UPDATE only by workers via service role — no policy needed for authenticated users.

-- ── trades ────────────────────────────────────────────────────────────────────
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trades_select" ON trades FOR SELECT USING (auth.uid() = user_id);
-- INSERT/UPDATE only by workers via service role.

-- ── audit_events — append-only ────────────────────────────────────────────────
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_events_select" ON audit_events FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE for authenticated users — service role only writes here.
-- (P1.28 adds a DB-level trigger that raises an error on UPDATE/DELETE for extra safety.)

-- ── telegram_sessions ─────────────────────────────────────────────────────────
ALTER TABLE telegram_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "telegram_sessions_select" ON telegram_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "telegram_sessions_insert" ON telegram_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "telegram_sessions_update" ON telegram_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "telegram_sessions_delete" ON telegram_sessions FOR DELETE USING (auth.uid() = user_id);

-- ── risk_settings ─────────────────────────────────────────────────────────────
ALTER TABLE risk_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "risk_settings_select" ON risk_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "risk_settings_insert" ON risk_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "risk_settings_update" ON risk_settings FOR UPDATE USING (auth.uid() = user_id);

-- ── trade_events — append-only ────────────────────────────────────────────────
ALTER TABLE trade_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trade_events_select" ON trade_events FOR SELECT USING (auth.uid() = user_id);
-- INSERT/UPDATE only by workers via service role.

-- ── subscriptions ─────────────────────────────────────────────────────────────
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_select" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
-- INSERT/UPDATE only by Stripe/Paystack webhook handlers via service role.

-- ── referrals ─────────────────────────────────────────────────────────────────
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
-- Referrers see all referrals they created; referees see their own entry.
CREATE POLICY "referrals_select_referrer" ON referrals FOR SELECT USING (auth.uid() = referrer_id);
CREATE POLICY "referrals_select_referee"  ON referrals FOR SELECT USING (auth.uid() = referee_id);

-- ── affiliate_accounts ────────────────────────────────────────────────────────
ALTER TABLE affiliate_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_accounts_select" ON affiliate_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "affiliate_accounts_update" ON affiliate_accounts FOR UPDATE USING (auth.uid() = user_id);
-- INSERT by webhook/admin; stats updated by webhook jobs via service role.

-- ── payouts ───────────────────────────────────────────────────────────────────
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payouts_select" ON payouts FOR SELECT USING (auth.uid() = user_id);
-- INSERT/UPDATE by payout-processor job via service role.
