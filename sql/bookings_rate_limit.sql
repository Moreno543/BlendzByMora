-- Run in Supabase → SQL Editor (safe to re-run; updates function + trigger).
--
-- 1) Blocklist: exact IPs you add to blocked_booking_ips are rejected immediately.
-- 2) Rate limit: max 3 bookings per rolling 24h per client_ip and per US phone (10 digits).
--
-- SECURITY DEFINER: trigger runs as function owner so anon inserts can still read
-- blocked_booking_ips / count bookings without exposing those tables via the API.

CREATE TABLE IF NOT EXISTS public.blocked_booking_ips (
  ip text PRIMARY KEY,
  note text,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.blocked_booking_ips IS
  'Manual IP blocklist for booking spam. No RLS policies for anon — manage in Dashboard only.';

ALTER TABLE public.blocked_booking_ips ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bookings_rate_limit_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ip_count integer;
  phone_norm text;
  phone_count integer;
  max_per_window constant integer := 3;
BEGIN
  phone_norm := right(regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g'), 10);

  IF NEW.client_ip IS NOT NULL AND btrim(NEW.client_ip) <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.blocked_booking_ips b WHERE b.ip = btrim(NEW.client_ip)
    ) THEN
      RAISE EXCEPTION 'BLOCKED_IP';
    END IF;

    SELECT COUNT(*) INTO ip_count
    FROM public.bookings
    WHERE client_ip = NEW.client_ip
      AND created_at > NOW() - INTERVAL '24 hours';

    IF ip_count >= max_per_window THEN
      RAISE EXCEPTION 'RATE_LIMIT_IP';
    END IF;
  END IF;

  IF phone_norm IS NOT NULL AND length(phone_norm) = 10 THEN
    SELECT COUNT(*) INTO phone_count
    FROM public.bookings
    WHERE right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) = phone_norm
      AND created_at > NOW() - INTERVAL '24 hours';

    IF phone_count >= max_per_window THEN
      RAISE EXCEPTION 'RATE_LIMIT_PHONE';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_rate_limit_check ON public.bookings;

CREATE TRIGGER bookings_rate_limit_check
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE PROCEDURE public.bookings_rate_limit_check();

COMMENT ON FUNCTION public.bookings_rate_limit_check() IS
  'Blocklist + rate limits for bookings (SECURITY DEFINER).';

-- If CREATE TRIGGER fails, use: EXECUTE FUNCTION public.bookings_rate_limit_check();

-- ── After the above succeeds, block specific IPs in a separate query (not auto-included): ──
-- INSERT INTO public.blocked_booking_ips (ip, note)
-- VALUES ('167.103.4.201', 'spam — optional note')
-- ON CONFLICT (ip) DO UPDATE SET note = EXCLUDED.note;
