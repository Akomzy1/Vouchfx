-- =============================================================================
-- VouchFX — Migration 020 · Prop equity state (Phase 2, P2.4 / P2.5)
--
-- prop_equity_state — persisted equity guardian state per broker account.
-- Survives executor worker restarts; restored on startup before streaming begins.
--
-- prop_daily_pnl — per-day realized PnL per account, for the consistency manager
-- (P2.6) and the consistency-meter dashboard display.
--
-- Run in the Supabase SQL editor after migration 019.
-- =============================================================================


-- ── 1. prop_equity_state ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.prop_equity_state (
  broker_connection_id  UUID PRIMARY KEY
                          REFERENCES public.broker_connections(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Intraday anchors (reset each UTC day)
  day_start_equity_usd  NUMERIC(15,2) NOT NULL,
  day_start_balance_usd NUMERIC(15,2) NOT NULL,
  current_day_key       TEXT NOT NULL,         -- 'YYYY-MM-DD' UTC

  -- Peak tracking
  peak_equity_usd       NUMERIC(15,2) NOT NULL, -- highest equity tick ever (intraday-trailing)
  eod_peak_balance_usd  NUMERIC(15,2) NOT NULL, -- highest EOD balance (EOD-trailing)

  -- Last known values
  last_equity_usd       NUMERIC(15,2) NOT NULL,
  last_balance_usd      NUMERIC(15,2) NOT NULL,

  -- Guardian status
  guardian_active       BOOLEAN NOT NULL DEFAULT true,
  flattened_at          TIMESTAMPTZ,            -- set when auto-flatten fires
  flattened_reason      TEXT,

  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.prop_equity_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own equity state"
  ON public.prop_equity_state FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.fn_prop_equity_state_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_prop_equity_state_updated_at ON public.prop_equity_state;
CREATE TRIGGER trg_prop_equity_state_updated_at
  BEFORE UPDATE ON public.prop_equity_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_prop_equity_state_updated_at();


-- ── 2. prop_daily_pnl ─────────────────────────────────────────────────────────
-- One row per (broker_connection_id, day_key). Updated by the executor after each
-- trade close/open within a prop account. Used by the consistency manager and
-- the consistency-meter UI.

CREATE TABLE IF NOT EXISTS public.prop_daily_pnl (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_connection_id  UUID NOT NULL
                          REFERENCES public.broker_connections(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day_key               TEXT NOT NULL,          -- 'YYYY-MM-DD' UTC
  realized_pnl_usd      NUMERIC(15,2) NOT NULL DEFAULT 0,
  trade_count           INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (broker_connection_id, day_key)
);

ALTER TABLE public.prop_daily_pnl ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own daily pnl"
  ON public.prop_daily_pnl FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.fn_prop_daily_pnl_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_prop_daily_pnl_updated_at ON public.prop_daily_pnl;
CREATE TRIGGER trg_prop_daily_pnl_updated_at
  BEFORE UPDATE ON public.prop_daily_pnl
  FOR EACH ROW EXECUTE FUNCTION public.fn_prop_daily_pnl_updated_at();
