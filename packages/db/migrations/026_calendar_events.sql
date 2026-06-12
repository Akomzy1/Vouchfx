-- Migration 026: Economic-calendar cache (PRD VCH-RSK-06b, VCH-RSK-06c)
--
-- calendar_events is the ONLY thing the news filter reads at decision time —
-- the risk engine never calls a feed during execution. The cache is populated
-- by the executor's daily JBlanked fetch (1 request/day hard limit) with the
-- ForexFactory JSON feed as a stale-cache fallback (max 2 requests / 5 min).
-- All event times are converted to UTC at ingest.
--
-- calendar_fetch_log tracks feed health and enforces the rate-limit guards:
-- the fetcher checks this table BEFORE making any request.

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name     TEXT NOT NULL,
  -- ISO currency the event affects ('USD', 'EUR', …) or 'All' for global events
  currency       TEXT NOT NULL,
  event_time_utc TIMESTAMPTZ NOT NULL,
  impact         TEXT NOT NULL
    CONSTRAINT calendar_events_impact_check
      CHECK (impact IN ('high', 'medium', 'low', 'holiday')),
  forecast       TEXT,
  previous       TEXT,
  source         TEXT NOT NULL
    CONSTRAINT calendar_events_source_check
      CHECK (source IN ('jblanked', 'forexfactory')),
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency for upserts across daily refetches and the fallback feed
CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_natural_key
  ON public.calendar_events (event_name, currency, event_time_utc);

-- The filter queries by time window + impact
CREATE INDEX IF NOT EXISTS calendar_events_time_impact
  ON public.calendar_events (event_time_utc, impact);

-- Read-only public data: any authenticated user may read; only the
-- service role (workers) writes.
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated read calendar" ON public.calendar_events;
CREATE POLICY "authenticated read calendar"
  ON public.calendar_events FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.calendar_fetch_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source     TEXT NOT NULL
    CONSTRAINT calendar_fetch_log_source_check
      CHECK (source IN ('jblanked', 'forexfactory')),
  -- success        → events ingested
  -- error          → non-network failure (bad status, parse error) — no same-day retry
  -- rate_limited   → source refused (e.g. FF "Request Denied" HTML)
  -- network_error  → transport failure — may retry
  status     TEXT NOT NULL
    CONSTRAINT calendar_fetch_log_status_check
      CHECK (status IN ('success', 'error', 'rate_limited', 'network_error')),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error      TEXT
);

CREATE INDEX IF NOT EXISTS calendar_fetch_log_source_time
  ON public.calendar_fetch_log (source, fetched_at DESC);

-- Service-role only (workers + admin health view)
ALTER TABLE public.calendar_fetch_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.calendar_events    IS 'UTC-normalised economic calendar cache — the news filter reads ONLY this table';
COMMENT ON TABLE public.calendar_fetch_log IS 'Feed health + rate-limit guard: checked before every fetch (JBlanked 1/day, FF 2/5min)';
