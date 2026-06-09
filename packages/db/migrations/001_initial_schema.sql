-- =============================================================================
-- VouchFX — Phase 0 Spike Schema (no RLS; single-user hardcoded)
-- Run against your Supabase project:
--   supabase db push  OR  paste into the Supabase SQL editor
-- RLS is added in P1.1 before multi-tenant launch.
-- =============================================================================

-- ── Helpers ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── users ─────────────────────────────────────────────────────────────────────
-- Spike: our own users table.
-- P1.1 will link id → auth.users(id) and add foreign key + RLS.

CREATE TABLE IF NOT EXISTS users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── broker_connections ────────────────────────────────────────────────────────
-- One row per MT5 account the user has connected.
-- MetaApi is fully managed: the user never sees metaapi_account_id.
-- P1.10 adds encrypted_credentials and credential_hint columns.

CREATE TABLE IF NOT EXISTS broker_connections (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metaapi_account_id  TEXT        NOT NULL,
  platform            TEXT        NOT NULL DEFAULT 'MT5' CHECK (platform IN ('MT5', 'MT4')),
  label               TEXT,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_broker_connections_updated_at
  BEFORE UPDATE ON broker_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── signal_sources ────────────────────────────────────────────────────────────
-- One row per Telegram channel/group the user copies signals from.

CREATE TABLE IF NOT EXISTS signal_sources (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_chat_id    BIGINT      NOT NULL,
  title               TEXT,
  is_enabled          BOOLEAN     NOT NULL DEFAULT TRUE,
  -- NULL = inherit the user's global daily_signal_limit from risk_settings
  daily_signal_limit  INT         CHECK (daily_signal_limit > 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Each user can only have one source per Telegram chat
  UNIQUE (user_id, telegram_chat_id)
);

CREATE TRIGGER trg_signal_sources_updated_at
  BEFORE UPDATE ON signal_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── parsed_signals ────────────────────────────────────────────────────────────
-- One row per Telegram message that was sent through the Claude parser.
--
-- IDEMPOTENCY FOUNDATION:
--   UNIQUE (source_id, telegram_message_id) guarantees that the same Telegram
--   message is never stored twice, even if the listener delivers it multiple
--   times (worker restart, queue redelivery, etc.).
--   The executor uses this id as the parsed_signal_id FK in `trades`.

CREATE TABLE IF NOT EXISTS parsed_signals (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id                   UUID        NOT NULL REFERENCES signal_sources(id) ON DELETE CASCADE,
  telegram_message_id         BIGINT      NOT NULL,
  -- Incremented by Telegram on each edit. Part of the BullMQ job id
  -- (${chat_id}:${message_id}:${edit_version}) but NOT part of the DB unique
  -- key — edits produce separate rows so both the original and modified signal
  -- are auditable.
  edit_version                INT         NOT NULL DEFAULT 0,
  raw_text                    TEXT,
  -- Claude structured output fields
  is_signal                   BOOLEAN     NOT NULL,
  symbol                      TEXT,
  side                        TEXT        CHECK (side IN ('BUY', 'SELL')),
  order_type                  TEXT        CHECK (order_type IN ('MARKET', 'LIMIT', 'STOP')),
  entries                     JSONB       NOT NULL DEFAULT '[]', -- number[]
  sl                          NUMERIC,
  sl_unit                     TEXT        CHECK (sl_unit IN ('price', 'pips', 'percent')),
  tps                         JSONB       NOT NULL DEFAULT '[]', -- number[]
  tp_unit                     TEXT        CHECK (tp_unit IN ('price', 'pips', 'percent')),
  confidence                  NUMERIC     NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  -- Shown verbatim in the user-facing audit log (transparency differentiator)
  reasoning                   TEXT        NOT NULL,
  follow_up_type              TEXT        CHECK (follow_up_type IN (
                                'NEW_SIGNAL','MODIFY_SL','MODIFY_TP','MOVE_TO_BE',
                                'CLOSE_PARTIAL','CLOSE_ALL','CANCEL_PENDING','IGNORE'
                              )),
  -- For follow-up messages: points to the originating signal in this channel
  references_prior_signal_id  UUID        REFERENCES parsed_signals(id),
  language_detected           TEXT        NOT NULL DEFAULT 'en',
  model_used                  TEXT        NOT NULL,
  parsed_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Idempotency: one parsed row per (source, message). Retries are no-ops.
  UNIQUE (source_id, telegram_message_id)
);

-- ── trades ────────────────────────────────────────────────────────────────────
-- One row per trade leg placed on the broker.
-- Multi-TP signals produce multiple rows (one per TP leg), all referencing
-- the same parsed_signal_id.
--
-- IDEMPOTENCY GUARD:
--   The partial unique index below ensures at most ONE row with status
--   PENDING or OPEN exists per parsed_signal_id at any time.
--   The executor inserts with ON CONFLICT DO NOTHING; if 0 rows are inserted
--   the trade already exists and the order must NOT be placed again.

CREATE TABLE IF NOT EXISTS trades (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parsed_signal_id      UUID        NOT NULL REFERENCES parsed_signals(id),
  broker_connection_id  UUID        NOT NULL REFERENCES broker_connections(id),
  -- Assigned by the broker on fill; NULL while PENDING
  broker_order_id       TEXT,
  symbol                TEXT        NOT NULL,
  side                  TEXT        NOT NULL CHECK (side IN ('BUY', 'SELL')),
  volume                NUMERIC     NOT NULL CHECK (volume > 0),
  entry_price           NUMERIC,    -- set on fill
  sl                    NUMERIC,
  tp                    NUMERIC,
  status                TEXT        NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','OPEN','CLOSED','CANCELLED','SKIPPED')),
  -- Populated when status = SKIPPED; explains why (confidence, risk cap, no SL, etc.)
  skip_reason           TEXT,
  opened_at             TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IDEMPOTENCY: prevent double-execution on the same signal.
-- Only one active (PENDING or OPEN) trade per parsed_signal_id is allowed.
-- INSERT ... ON CONFLICT DO NOTHING in the executor uses this index.
CREATE UNIQUE INDEX IF NOT EXISTS trades_one_active_per_signal
  ON trades (parsed_signal_id)
  WHERE status IN ('PENDING', 'OPEN');

CREATE TRIGGER trg_trades_updated_at
  BEFORE UPDATE ON trades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── audit_events ──────────────────────────────────────────────────────────────
-- Append-only. Every step of a signal's lifecycle is written here.
-- This table drives the user-facing audit log / signal detail view.
-- Never UPDATE or DELETE rows — the transparency guarantee depends on it.
-- P1.1 adds a ROW SECURITY policy that only allows INSERT (no UPDATE/DELETE).

CREATE TABLE IF NOT EXISTS audit_events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parsed_signal_id  UUID        REFERENCES parsed_signals(id),
  trade_id          UUID        REFERENCES trades(id),
  -- Lifecycle stages: received | parsed | executed | skipped | modified |
  --                   cancelled | closed | error
  event_type        TEXT        NOT NULL,
  -- Free-form JSON context: raw message, parsed fields, risk check result,
  -- broker response, skip reason — whatever is relevant for the event type.
  -- Credentials, session strings, and full passwords are NEVER stored here.
  payload           JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- No updated_at — append-only by design.
);

-- Fast lookup for a signal's full audit trail
CREATE INDEX IF NOT EXISTS audit_events_signal_idx ON audit_events (parsed_signal_id);
CREATE INDEX IF NOT EXISTS audit_events_trade_idx  ON audit_events (trade_id);
