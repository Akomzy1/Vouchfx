-- =============================================================================
-- VouchFX — Phase 0 Spike Seed Data
-- One hardcoded test user, broker connection, and signal source.
-- Used only for the Phase 0 single-user end-to-end spike.
-- Remove or replace before Phase 1 multi-tenant launch.
-- =============================================================================

-- Fixed UUIDs so the spike workers can reference them via env vars.
-- In production these are generated dynamically and stored in the DB.

INSERT INTO users (id, email)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'spike@vouchfx.dev'
)
ON CONFLICT (id) DO NOTHING;

-- Placeholder broker connection — metaapi_account_id is filled by the
-- developer after provisioning a MetaApi demo account (P0.4).
INSERT INTO broker_connections (id, user_id, metaapi_account_id, platform, label)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'REPLACE_WITH_METAAPI_ACCOUNT_ID',
  'MT5',
  'Demo account (spike)'
)
ON CONFLICT (id) DO NOTHING;

-- Placeholder signal source — telegram_chat_id is filled by the developer
-- with a real Telegram channel chat id (P0.2).
INSERT INTO signal_sources (id, user_id, telegram_chat_id, title, is_enabled)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  -1001234567890,  -- replace with real chat id
  'Spike test channel',
  TRUE
)
ON CONFLICT (id) DO NOTHING;
