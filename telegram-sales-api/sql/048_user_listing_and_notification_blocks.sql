-- 048_user_listing_and_notification_blocks.sql
-- Supports admin bot user lists and users that cannot receive bot notifications.

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

CREATE TABLE IF NOT EXISTS bot_notification_blocks (
  telegram_id bigint PRIMARY KEY,
  reason text,
  last_error text,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at timestamptz NOT NULL DEFAULT now()
);
