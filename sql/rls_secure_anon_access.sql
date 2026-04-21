-- Secure public (anon) access for Blendz By Mora
-- Run in Supabase → SQL Editor after bookings + reviews tables exist.
--
-- Prereqs (no-op if already applied):
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS client_ip TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN NOT NULL DEFAULT false;
--
-- Effect:
-- - Anon can INSERT bookings/reviews (unchanged).
-- - Anon CANNOT SELECT rows from bookings/reviews (no scraping PII / full tables).
-- - Slot availability uses get_booked_times(date) → only times for that date.
-- - New bookings use insert_booking_from_client(...) → returns id for SMS (no broad SELECT).
-- - Review carousel uses list_reviews_public(limit) → same fields the site shows publicly.
--
-- Safe to re-run (CREATE OR REPLACE + DROP POLICY IF EXISTS).

-- ---------------------------------------------------------------------------
-- RPC: booked time strings for one date (no names, emails, phones)
-- ---------------------------------------------------------------------------
-- Output column must not be named "time" (reserved); use slot_time.
CREATE OR REPLACE FUNCTION public.get_booked_times(p_date date)
RETURNS TABLE(slot_time text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT b.time AS slot_time
  FROM public.bookings b
  WHERE b.date = p_date;
$$;

REVOKE ALL ON FUNCTION public.get_booked_times(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booked_times(date) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: insert one booking from the website; returns new row id (for SMS fn)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_booking_from_client(
  p_service text,
  p_date date,
  p_time text,
  p_name text,
  p_email text,
  p_phone text,
  p_travel text DEFAULT 'No',
  p_notes text DEFAULT NULL,
  p_sms_consent boolean DEFAULT false,
  p_client_ip text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  v_travel text;
BEGIN
  v_travel := NULLIF(trim(COALESCE(p_travel, '')), '');
  IF v_travel IS NULL THEN
    v_travel := 'No';
  END IF;

  INSERT INTO public.bookings (
    service,
    date,
    time,
    name,
    email,
    phone,
    travel,
    notes,
    sms_consent,
    client_ip
  )
  VALUES (
    trim(p_service),
    p_date,
    trim(p_time),
    trim(p_name),
    trim(p_email),
    trim(p_phone),
    v_travel,
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    COALESCE(p_sms_consent, false),
    NULLIF(trim(COALESCE(p_client_ip, '')), '')
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_booking_from_client(
  text, date, text, text, text, text, text, text, boolean, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_booking_from_client(
  text, date, text, text, text, text, text, text, boolean, text
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: reviews shown on the homepage (bounded limit)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_reviews_public(p_limit int DEFAULT 50)
RETURNS TABLE(
  id uuid,
  name text,
  service text,
  rating text,
  review text,
  image_url text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    r.id,
    r.name,
    r.service,
    r.rating,
    r.review,
    r.image_url,
    r.created_at
  FROM public.reviews r
  ORDER BY r.created_at ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.list_reviews_public(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_reviews_public(integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS: remove blanket anonymous SELECT on sensitive tables
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow anonymous select" ON public.bookings;
DROP POLICY IF EXISTS "Allow anonymous select reviews" ON public.reviews;

-- Keep INSERT policies (create if missing — first-time / renamed projects)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bookings'
      AND policyname = 'Allow anonymous insert'
  ) THEN
    CREATE POLICY "Allow anonymous insert" ON public.bookings
      FOR INSERT TO anon WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reviews'
      AND policyname = 'Allow anonymous insert reviews'
  ) THEN
    CREATE POLICY "Allow anonymous insert reviews" ON public.reviews
      FOR INSERT TO anon WITH CHECK (true);
  END IF;
END;
$$;
