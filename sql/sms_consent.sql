-- A2P 10DLC: optional SMS opt-in on booking (never required to submit).
-- Run once in Supabase → SQL Editor.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bookings.sms_consent IS 'User opted in to SMS on booking form; booking-sms and reminders only send when true.';
