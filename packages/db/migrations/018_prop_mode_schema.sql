-- =============================================================================
-- VouchFX — Migration 018 · Prop Mode schema (Phase 2, P2.1)
--
-- Tables:
--   user_roles           — first-class role assignment (rule_approver)
--   prop_firms           — supported prop firm reference data
--   prop_rulesets        — versioned, per-firm/challenge rule presets
--   prop_account_profiles — links a broker_connection to an active ruleset
--   prop_rule_audit      — append-only audit trail for rule changes
--
-- RLS:
--   user_roles:           users read own; insert/update only via service role
--   prop_firms:           global read (authenticated); write via service role
--   prop_rulesets:        global read; insert/update only for rule_approver role
--   prop_account_profiles: user-scoped (auth.uid())
--   prop_rule_audit:      rule_approver can SELECT; INSERT via service role only
--
-- Run in the Supabase SQL editor.
-- =============================================================================


-- ── 1. user_roles (first-class permission system) ─────────────────────────────
-- Stores role assignments. Currently only 'rule_approver' exists.
-- Only service-role (ops) can grant/revoke roles.

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('rule_approver')),
  granted_by TEXT NOT NULL,                          -- email of admin who granted
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Users may read their own roles (e.g. to show/hide the approval queue in UI)
CREATE POLICY "users read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- INSERT/UPDATE/DELETE: no user-facing policy → service role only


-- ── 2. is_rule_approver() — helper used by RLS policies below ─────────────────
-- SECURITY DEFINER so it can bypass RLS on user_roles when checking.

CREATE OR REPLACE FUNCTION public.is_rule_approver()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'rule_approver'
  );
$$;


-- ── 3. prop_firms ──────────────────────────────────────────────────────────────
-- One row per supported firm. Seeded in migration 019 (P2.2).

CREATE TABLE IF NOT EXISTS public.prop_firms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,           -- e.g. 'fundingpips', 'the5ers'
  website_url TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,  -- false = hidden from user selection
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.prop_firms ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may read — needed to display firm pickers
CREATE POLICY "prop firms are globally readable"
  ON public.prop_firms FOR SELECT TO authenticated
  USING (true);
-- INSERT/UPDATE: service role only (no user-facing write policy)


-- ── 4. prop_rulesets ──────────────────────────────────────────────────────────
-- Versioned ruleset per firm + challenge type.
-- Status lifecycle:  draft → pending_approval → published
--                                             → rejected
--                    published → rolled_back (a prior version re-published)
-- Only one row may have is_current = true per (firm_id, challenge_name).

CREATE TABLE IF NOT EXISTS public.prop_rulesets (
  id                     UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                UUID    NOT NULL REFERENCES public.prop_firms(id) ON DELETE CASCADE,
  challenge_name         TEXT    NOT NULL,          -- e.g. 'Standard Challenge', 'Express'
  version                INTEGER NOT NULL DEFAULT 1,
  status                 TEXT    NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','pending_approval','published','rejected','rolled_back')),
  is_current             BOOLEAN NOT NULL DEFAULT false,

  -- ── Core risk fields ────────────────────────────────────────────────────────
  -- daily_loss_pct: maximum loss in one trading day as % of basis
  daily_loss_pct         NUMERIC(6,3) NOT NULL,
  -- equity | balance: which metric the daily-loss floor is measured against
  daily_loss_basis       TEXT NOT NULL DEFAULT 'equity'
                           CHECK (daily_loss_basis IN ('equity','balance')),
  -- max_drawdown_pct: maximum total drawdown as % of starting/trailing equity
  max_drawdown_pct       NUMERIC(6,3) NOT NULL,
  -- static: from initial balance; eod_trailing: resets daily at EOD balance;
  -- intraday_trailing: follows peak intraday equity live
  max_drawdown_model     TEXT NOT NULL DEFAULT 'static'
                           CHECK (max_drawdown_model IN ('static','eod_trailing','intraday_trailing')),
  -- consistency_pct: max allowed % of total profit in a single day; NULL = none
  consistency_pct        NUMERIC(6,3),

  -- ── News handling ───────────────────────────────────────────────────────────
  news_before_min        INTEGER NOT NULL DEFAULT 0,   -- minutes before event
  news_after_min         INTEGER NOT NULL DEFAULT 0,   -- minutes after event

  -- ── Account/trading rules ───────────────────────────────────────────────────
  weekend_holding_allowed  BOOLEAN NOT NULL DEFAULT false,
  min_trading_days         INTEGER NOT NULL DEFAULT 0,
  -- LAUNCH CRITERION: only firms with copy_trading_permitted = true are published
  copy_trading_permitted   BOOLEAN NOT NULL DEFAULT true,

  -- ── Provenance ──────────────────────────────────────────────────────────────
  source_url             TEXT,                -- canonical URL of the rules page/PDF
  verified_at            TIMESTAMPTZ,         -- when source was last read
  published_by           TEXT,                -- 'agent:auto' | 'user:<email>'
  published_at           TIMESTAMPTZ,
  -- 0.000–1.000; NULL = human-entered (full confidence assumed)
  agent_confidence       NUMERIC(4,3) CHECK (agent_confidence IS NULL OR (agent_confidence >= 0 AND agent_confidence <= 1)),
  notes                  TEXT,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce at most one current ruleset per firm + challenge at the DB level
CREATE UNIQUE INDEX IF NOT EXISTS prop_rulesets_current_uidx
  ON public.prop_rulesets (firm_id, challenge_name)
  WHERE is_current = true;

ALTER TABLE public.prop_rulesets ENABLE ROW LEVEL SECURITY;

-- All authenticated users may read published rulesets
CREATE POLICY "prop rulesets are globally readable"
  ON public.prop_rulesets FOR SELECT TO authenticated
  USING (true);

-- Only rule_approvers may insert new ruleset versions
CREATE POLICY "rule approvers can insert rulesets"
  ON public.prop_rulesets FOR INSERT TO authenticated
  WITH CHECK (public.is_rule_approver());

-- Only rule_approvers may update ruleset status / is_current
CREATE POLICY "rule approvers can update rulesets"
  ON public.prop_rulesets FOR UPDATE TO authenticated
  USING (public.is_rule_approver());


-- ── 5. prop_account_profiles ──────────────────────────────────────────────────
-- Connects one broker account to one active ruleset.
-- One profile per broker_connection (UNIQUE constraint).

CREATE TABLE IF NOT EXISTS public.prop_account_profiles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  broker_connection_id UUID NOT NULL REFERENCES public.broker_connections(id) ON DELETE CASCADE,
  ruleset_id           UUID NOT NULL REFERENCES public.prop_rulesets(id),
  enabled              BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (broker_connection_id)             -- one profile per broker account
);

ALTER TABLE public.prop_account_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own prop profiles"
  ON public.prop_account_profiles FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Keep updated_at current
CREATE OR REPLACE FUNCTION public.fn_prop_account_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_prop_account_profiles_updated_at ON public.prop_account_profiles;
CREATE TRIGGER trg_prop_account_profiles_updated_at
  BEFORE UPDATE ON public.prop_account_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_prop_account_profiles_updated_at();


-- ── 6. prop_rule_audit (append-only) ──────────────────────────────────────────
-- Every rule-change event is recorded here: agent proposals, approvals,
-- rejections, auto-publishes, rollbacks. Never updated or deleted.

CREATE TABLE IF NOT EXISTS public.prop_rule_audit (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id          UUID NOT NULL REFERENCES public.prop_firms(id) ON DELETE CASCADE,
  ruleset_id       UUID REFERENCES public.prop_rulesets(id),
  action           TEXT NOT NULL
                     CHECK (action IN
                       ('agent_proposal','approved','rejected','auto_published',
                        'published','rolled_back','rollback_applied')),
  actor            TEXT NOT NULL,            -- 'agent:auto' | 'user:<email>'
  old_values       JSONB,                    -- previous field values for diffs
  new_values       JSONB,                    -- proposed/new field values
  source_url       TEXT,
  agent_confidence NUMERIC(4,3) CHECK (agent_confidence IS NULL OR (agent_confidence >= 0 AND agent_confidence <= 1)),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.prop_rule_audit ENABLE ROW LEVEL SECURITY;

-- Rule approvers may read the full audit trail
CREATE POLICY "rule approvers read prop rule audit"
  ON public.prop_rule_audit FOR SELECT TO authenticated
  USING (public.is_rule_approver());
-- INSERT: service role only (no user-facing insert policy)


-- ── 7. prop_rule_audit is append-only ─────────────────────────────────────────
-- Matches the audit_events pattern from migration 017.

CREATE OR REPLACE FUNCTION public.fn_prop_rule_audit_readonly()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'prop_rule_audit is append-only: % not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_prop_rule_audit_no_update ON public.prop_rule_audit;
CREATE TRIGGER trg_prop_rule_audit_no_update
  BEFORE UPDATE ON public.prop_rule_audit
  FOR EACH ROW EXECUTE FUNCTION public.fn_prop_rule_audit_readonly();

DROP TRIGGER IF EXISTS trg_prop_rule_audit_no_delete ON public.prop_rule_audit;
CREATE TRIGGER trg_prop_rule_audit_no_delete
  BEFORE DELETE ON public.prop_rule_audit
  FOR EACH ROW EXECUTE FUNCTION public.fn_prop_rule_audit_readonly();
