-- Pause booking rate limits while testing (Supabase → SQL Editor → Run).
-- Re-enable with sql/bookings_rate_limit_resume.sql when done.

DROP TRIGGER IF EXISTS bookings_rate_limit_check ON public.bookings;
