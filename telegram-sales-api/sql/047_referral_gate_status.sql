-- 047_referral_gate_status.sql
-- Controls whether users must enter through an affiliate code/referral.

ALTER TABLE IF EXISTS bot_maintenance
  ADD COLUMN IF NOT EXISTS referral_gate_active boolean NOT NULL DEFAULT true;
