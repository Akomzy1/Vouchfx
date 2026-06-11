-- =============================================================================
-- VouchFX — Migration 009 · Notifications
-- Run in the Supabase SQL editor.
-- =============================================================================

-- ── notification_preferences ─────────────────────────────────────────────────
-- One row per user per event type. Missing rows default to enabled.

CREATE TABLE IF NOT EXISTS notification_preferences (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type     TEXT        NOT NULL,
  email_enabled  BOOLEAN     NOT NULL DEFAULT true,
  in_app_enabled BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_type)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification preferences"
  ON notification_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── notifications ─────────────────────────────────────────────────────────────
-- In-app notification inbox. Append-only; read_at set to mark read.

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
  ON notifications FOR SELECT USING (auth.uid() = user_id);

-- Service role can insert (workers notify users)
CREATE POLICY "Service role insert notifications"
  ON notifications FOR INSERT WITH CHECK (true);

-- Users can mark own as read
CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Grant Realtime replication
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
