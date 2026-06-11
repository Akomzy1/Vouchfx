-- Migration 024: news filter on risk_settings + channel enhancements
-- Adds per-channel risk override, kill-switch, and news filter toggle.

-- ── risk_settings: news filter ─────────────────────────────────────────────────
ALTER TABLE public.risk_settings
  ADD COLUMN IF NOT EXISTS news_filter_enabled   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS news_filter_window_min INTEGER NOT NULL DEFAULT 60
    CONSTRAINT risk_settings_news_filter_window_check CHECK (news_filter_window_min >= 5 AND news_filter_window_min <= 240);

-- ── signal_sources: per-channel risk override + kill-switch ────────────────────
ALTER TABLE public.signal_sources
  ADD COLUMN IF NOT EXISTS override_risk_enabled  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_risk_pct      NUMERIC
    CONSTRAINT signal_sources_override_risk_pct_check CHECK (override_risk_pct > 0 AND override_risk_pct <= 100),
  ADD COLUMN IF NOT EXISTS kill_close_requested_at TIMESTAMPTZ;
