-- =============================================================================
-- VouchFX — Migration 006 · Broker connection status column
--
-- Adds status tracking to broker_connections so the web UI can reflect
-- MetaApi's deployment + connection state without polling on every page load.
-- =============================================================================

ALTER TABLE broker_connections
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'deploying'
    CHECK (status IN ('deploying', 'connected', 'disconnected', 'error')),
  ADD COLUMN IF NOT EXISTS server_hint TEXT,   -- MT5 server name for display (not a secret)
  ADD COLUMN IF NOT EXISTS last_status_at TIMESTAMPTZ;

-- Back-fill existing rows so the constraint is satisfied
UPDATE broker_connections SET status = 'connected' WHERE status IS NULL;
