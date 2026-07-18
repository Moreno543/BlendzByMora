-- Turn booking rate limits back on after testing (Supabase → SQL Editor → Run).
-- Same rules as sql/bookings_rate_limit.sql: max 3 per 24h per IP and phone.

CREATE TRIGGER bookings_rate_limit_check
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE PROCEDURE public.bookings_rate_limit_check();
