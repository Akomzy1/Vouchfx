-- =============================================================================
-- VouchFX — Migration 036 · Performance & calendar analytics (PRD §6.15)
--
-- Read-only analytics over data VouchFX already captures. NO new data
-- collection — every figure derives from CLOSED trades and their trade_events.
--
-- Design (VCH-PERF-01..05):
--   • Realised P&L per trade = SUM(trade_events.pnl) over its close events.
--   • Realised stats use CLOSED trades ONLY; floating/unrealised P&L is never
--     mixed in (it is shown separately in the UI from broker equity−balance).
--   • Day bucketing uses the USER'S DISPLAY TIMEZONE, passed as p_tz, applied as
--     (closed_at AT TIME ZONE p_tz)::date — so a trade closing 23:59 vs 00:01
--     local lands in the correct day.
--   • Per-channel attribution via parsed_signals → signal_sources.title.
--   • Demo and live are NEVER merged: callers pass either a specific
--     broker_connection_id, or an account_mode ('demo'|'live') for the combined
--     view of that mode. When both are null we default to 'live' as a safety net
--     so figures can never silently blend demo + live.
--   • is_simulated (legacy paper trades) are excluded entirely.
--
-- All objects are SECURITY INVOKER + rely on existing RLS (trades / trade_events
-- / parsed_signals / signal_sources are all scoped to auth.uid()). Aggregation
-- happens in SQL with the indexes below — the client never loads raw trades.
--
-- Idempotent. Run in the Supabase SQL editor after migration 035.
-- =============================================================================


-- ── 1. Indexes for the range/day scans ───────────────────────────────────────
-- Calendar/metrics filter closed trades by user + closed_at; per-account views
-- add broker_connection_id. trade_events already has trade_events_trade_idx.

CREATE INDEX IF NOT EXISTS trades_perf_closed_idx
  ON public.trades (user_id, closed_at)
  WHERE status = 'CLOSED';

CREATE INDEX IF NOT EXISTS trades_perf_broker_closed_idx
  ON public.trades (broker_connection_id, closed_at)
  WHERE status = 'CLOSED';


-- ── 2. Per-trade realised-P&L view ───────────────────────────────────────────
-- One row per CLOSED trade with its net realised P&L, exit price, source channel
-- and account. security_invoker = true so the caller's RLS filters the rows
-- (each underlying table is scoped to auth.uid()).

DROP VIEW IF EXISTS public.v_perf_closed_trades;
CREATE VIEW public.v_perf_closed_trades
  WITH (security_invoker = true) AS
SELECT
  t.user_id,
  t.id                                   AS trade_id,
  t.parsed_signal_id                     AS signal_id,
  ss.id                                  AS source_id,
  COALESCE(NULLIF(ss.title, ''), 'Unknown channel') AS channel,
  t.broker_connection_id,
  bc.account_mode,
  bc.label                               AS account_label,
  t.symbol,
  t.side,
  t.volume,
  t.entry_price,
  ev.exit_price,
  t.closed_at,
  COALESCE(pv.pnl, 0)                     AS pnl
FROM public.trades t
JOIN public.parsed_signals   ps ON ps.id = t.parsed_signal_id
JOIN public.signal_sources   ss ON ss.id = ps.source_id
JOIN public.broker_connections bc ON bc.id = t.broker_connection_id
-- Net realised P&L for the trade = sum of its close-event pnls.
LEFT JOIN LATERAL (
  SELECT SUM(te.pnl) AS pnl
  FROM public.trade_events te
  WHERE te.trade_id = t.id
    AND te.event_type IN ('tp_hit', 'sl_hit', 'closed_partial', 'closed_full')
) pv ON TRUE
-- Exit price = price of the most recent close event.
LEFT JOIN LATERAL (
  SELECT te.price AS exit_price
  FROM public.trade_events te
  WHERE te.trade_id = t.id
    AND te.event_type IN ('tp_hit', 'sl_hit', 'closed_partial', 'closed_full')
    AND te.price IS NOT NULL
  ORDER BY te.created_at DESC
  LIMIT 1
) ev ON TRUE
WHERE t.status = 'CLOSED'
  AND t.closed_at IS NOT NULL
  AND COALESCE(t.is_simulated, FALSE) = FALSE;

GRANT SELECT ON public.v_perf_closed_trades TO authenticated;


-- ── 3. Scope predicate helper (documented, inlined in each function) ──────────
-- Every function applies the same account scope:
--   (p_broker IS NOT NULL AND broker_connection_id = p_broker)
--   OR (p_broker IS NULL AND account_mode = COALESCE(p_mode, 'live'))
-- and the same tz-bucketed date window on (closed_at AT TIME ZONE p_tz)::date.


-- ── 4. Calendar: per-day aggregates for one month (VCH-PERF-01) ───────────────

CREATE OR REPLACE FUNCTION public.fn_perf_calendar(
  p_month_start DATE,
  p_tz          TEXT,
  p_broker      UUID DEFAULT NULL,
  p_mode        TEXT DEFAULT NULL
)
RETURNS TABLE (day DATE, net_pnl NUMERIC, trade_count INT, win_count INT)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    (v.closed_at AT TIME ZONE p_tz)::date       AS day,
    SUM(v.pnl)                                  AS net_pnl,
    COUNT(*)::int                               AS trade_count,
    COUNT(*) FILTER (WHERE v.pnl > 0)::int       AS win_count
  FROM public.v_perf_closed_trades v
  WHERE (
          (p_broker IS NOT NULL AND v.broker_connection_id = p_broker)
       OR (p_broker IS NULL AND v.account_mode = COALESCE(p_mode, 'live'))
        )
    AND (v.closed_at AT TIME ZONE p_tz)::date >= p_month_start
    AND (v.closed_at AT TIME ZONE p_tz)::date <  (p_month_start + INTERVAL '1 month')
  GROUP BY 1
  ORDER BY 1;
$$;


-- ── 5. Day drill-down: trades closed on one day (VCH-PERF-02) ─────────────────

CREATE OR REPLACE FUNCTION public.fn_perf_day_trades(
  p_day    DATE,
  p_tz     TEXT,
  p_broker UUID DEFAULT NULL,
  p_mode   TEXT DEFAULT NULL
)
RETURNS TABLE (
  trade_id     UUID,
  signal_id    UUID,
  symbol       TEXT,
  side         TEXT,
  volume       NUMERIC,
  entry_price  NUMERIC,
  exit_price   NUMERIC,
  pnl          NUMERIC,
  channel      TEXT,
  closed_at    TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    v.trade_id, v.signal_id, v.symbol, v.side, v.volume,
    v.entry_price, v.exit_price, v.pnl, v.channel, v.closed_at
  FROM public.v_perf_closed_trades v
  WHERE (
          (p_broker IS NOT NULL AND v.broker_connection_id = p_broker)
       OR (p_broker IS NULL AND v.account_mode = COALESCE(p_mode, 'live'))
        )
    AND (v.closed_at AT TIME ZONE p_tz)::date = p_day
  ORDER BY v.closed_at;
$$;


-- ── 6. Metrics panel: raw scalar components for a range (VCH-PERF-03) ─────────
-- Ratios (win %, day win %, profit factor, avg trades/day) are derived in TS
-- from these components (see @vouchfx/core performance/metrics), so the tested
-- formula lives in one place and divide-by-zero is handled uniformly.

CREATE OR REPLACE FUNCTION public.fn_perf_metrics(
  p_from   DATE,
  p_to     DATE,          -- exclusive upper bound
  p_tz     TEXT,
  p_broker UUID DEFAULT NULL,
  p_mode   TEXT DEFAULT NULL
)
RETURNS TABLE (
  net_pnl        NUMERIC,
  total_trades   INT,
  winning_trades INT,
  losing_trades  INT,
  gross_profit   NUMERIC,
  gross_loss     NUMERIC,   -- positive magnitude of losses
  trading_days   INT,
  green_days     INT
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH scoped AS (
    SELECT
      v.pnl,
      (v.closed_at AT TIME ZONE p_tz)::date AS day
    FROM public.v_perf_closed_trades v
    WHERE (
            (p_broker IS NOT NULL AND v.broker_connection_id = p_broker)
         OR (p_broker IS NULL AND v.account_mode = COALESCE(p_mode, 'live'))
          )
      AND (v.closed_at AT TIME ZONE p_tz)::date >= p_from
      AND (v.closed_at AT TIME ZONE p_tz)::date <  p_to
  ),
  by_day AS (
    SELECT day, SUM(pnl) AS day_pnl FROM scoped GROUP BY day
  )
  SELECT
    COALESCE(SUM(s.pnl), 0)                                        AS net_pnl,
    COUNT(*)::int                                                 AS total_trades,
    COUNT(*) FILTER (WHERE s.pnl > 0)::int                        AS winning_trades,
    COUNT(*) FILTER (WHERE s.pnl < 0)::int                        AS losing_trades,
    COALESCE(SUM(s.pnl) FILTER (WHERE s.pnl > 0), 0)              AS gross_profit,
    COALESCE(-SUM(s.pnl) FILTER (WHERE s.pnl < 0), 0)             AS gross_loss,
    (SELECT COUNT(*) FROM by_day)::int                            AS trading_days,
    (SELECT COUNT(*) FROM by_day WHERE day_pnl > 0)::int          AS green_days
  FROM scoped s;
$$;


-- ── 7. Daily net series for the equity curve (VCH-PERF-03) ────────────────────
-- Per-day net; the cumulative curve is built in the client.

CREATE OR REPLACE FUNCTION public.fn_perf_daily_series(
  p_from   DATE,
  p_to     DATE,
  p_tz     TEXT,
  p_broker UUID DEFAULT NULL,
  p_mode   TEXT DEFAULT NULL
)
RETURNS TABLE (day DATE, net_pnl NUMERIC)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    (v.closed_at AT TIME ZONE p_tz)::date AS day,
    SUM(v.pnl)                            AS net_pnl
  FROM public.v_perf_closed_trades v
  WHERE (
          (p_broker IS NOT NULL AND v.broker_connection_id = p_broker)
       OR (p_broker IS NULL AND v.account_mode = COALESCE(p_mode, 'live'))
        )
    AND (v.closed_at AT TIME ZONE p_tz)::date >= p_from
    AND (v.closed_at AT TIME ZONE p_tz)::date <  p_to
  GROUP BY 1
  ORDER BY 1;
$$;


-- ── 8. Per-channel performance table (VCH-PERF-04) ────────────────────────────
-- Raw components per channel; win % / profit factor / avg win/loss derived in TS.

CREATE OR REPLACE FUNCTION public.fn_perf_channels(
  p_from   DATE,
  p_to     DATE,
  p_tz     TEXT,
  p_broker UUID DEFAULT NULL,
  p_mode   TEXT DEFAULT NULL
)
RETURNS TABLE (
  source_id      UUID,
  channel        TEXT,
  net_pnl        NUMERIC,
  total_trades   INT,
  winning_trades INT,
  losing_trades  INT,
  gross_profit   NUMERIC,
  gross_loss     NUMERIC
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    v.source_id,
    MAX(v.channel)                                    AS channel,
    COALESCE(SUM(v.pnl), 0)                           AS net_pnl,
    COUNT(*)::int                                     AS total_trades,
    COUNT(*) FILTER (WHERE v.pnl > 0)::int            AS winning_trades,
    COUNT(*) FILTER (WHERE v.pnl < 0)::int            AS losing_trades,
    COALESCE(SUM(v.pnl) FILTER (WHERE v.pnl > 0), 0)  AS gross_profit,
    COALESCE(-SUM(v.pnl) FILTER (WHERE v.pnl < 0), 0) AS gross_loss
  FROM public.v_perf_closed_trades v
  WHERE (
          (p_broker IS NOT NULL AND v.broker_connection_id = p_broker)
       OR (p_broker IS NULL AND v.account_mode = COALESCE(p_mode, 'live'))
        )
    AND (v.closed_at AT TIME ZONE p_tz)::date >= p_from
    AND (v.closed_at AT TIME ZONE p_tz)::date <  p_to
  GROUP BY v.source_id
  ORDER BY net_pnl DESC;
$$;


GRANT EXECUTE ON FUNCTION public.fn_perf_calendar(DATE, TEXT, UUID, TEXT)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_perf_day_trades(DATE, TEXT, UUID, TEXT)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_perf_metrics(DATE, DATE, TEXT, UUID, TEXT)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_perf_daily_series(DATE, DATE, TEXT, UUID, TEXT)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_perf_channels(DATE, DATE, TEXT, UUID, TEXT)         TO authenticated;
