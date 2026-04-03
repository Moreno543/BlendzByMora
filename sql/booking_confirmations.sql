-- OPTIONAL: separate audit log for SMS YES (not used by the live site or admin).
-- The app stores confirmations on bookings.sms_confirmed_at instead.
-- Only run this if you want a history table in addition to the booking column.

CREATE TABLE IF NOT EXISTS booking_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_message TEXT,
  source TEXT NOT NULL DEFAULT 'sms',
  twilio_message_sid TEXT
);

DROP INDEX IF EXISTS booking_confirmations_booking_id_key;

CREATE INDEX IF NOT EXISTS booking_confirmations_booking_id_idx
  ON booking_confirmations(booking_id);

CREATE INDEX IF NOT EXISTS booking_confirmations_confirmed_at_idx
  ON booking_confirmations(confirmed_at DESC);

ALTER TABLE booking_confirmations ENABLE ROW LEVEL SECURITY;

ALTER TABLE booking_confirmations
  ADD COLUMN IF NOT EXISTS twilio_message_sid TEXT;
