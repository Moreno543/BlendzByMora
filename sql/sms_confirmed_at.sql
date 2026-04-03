-- When a client texts YES, Netlify sets this on the matching booking row.
-- Run in Supabase SQL Editor (safe to run again).

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS sms_confirmed_at TIMESTAMPTZ;
