-- Run once in Supabase → SQL Editor after bookings table exists.
-- Stores the submitter's IP as seen by Netlify (browser → client-ip function → booking form).

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS client_ip TEXT;

COMMENT ON COLUMN public.bookings.client_ip IS 'Public IP at submit time (from Netlify edge; approximate, may be VPN/carrier NAT).';
