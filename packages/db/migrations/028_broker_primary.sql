-- Migration 028: Primary broker account (explicit multi-account routing)
--
-- Until now, when a user had more than one active broker connection the
-- listener routed signals to whichever row Postgres returned first — an
-- unordered query, so the choice was indeterminate. This adds an explicit
-- primary flag so routing is deterministic and user-controlled.
--
-- The signal router (listener + executor) orders by (is_primary DESC,
-- created_at ASC), so even with no row flagged the OLDEST active connection
-- wins deterministically. The partial unique index guarantees at most one
-- primary per user.

ALTER TABLE public.broker_connections
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

-- At most one primary connection per user.
CREATE UNIQUE INDEX IF NOT EXISTS broker_connections_one_primary_per_user
  ON public.broker_connections (user_id)
  WHERE is_primary;

-- Backfill: mark the oldest connection per user as primary (prefer active),
-- so existing users get a sensible default that matches the old "first row"
-- behaviour as closely as possible.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY is_active DESC, created_at ASC
    ) AS rn
  FROM public.broker_connections
)
UPDATE public.broker_connections bc
SET is_primary = true
FROM ranked r
WHERE bc.id = r.id
  AND r.rn = 1
  AND NOT EXISTS (
    -- don't double-set if a user somehow already has a primary
    SELECT 1 FROM public.broker_connections x
    WHERE x.user_id = bc.user_id AND x.is_primary
  );

COMMENT ON COLUMN public.broker_connections.is_primary IS 'The account new signals route to. Exactly one per user (partial unique index); router falls back to oldest active when unset.';
