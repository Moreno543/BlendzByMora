-- Run once in Supabase → SQL Editor.
-- Only bookings with a paid deposit hold a time slot on the booking page.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ;

COMMENT ON COLUMN public.bookings.deposit_paid_at IS
  'When the deposit was paid (or booking confirmed without online deposit). NULL = pending payment — does not block the slot.';

-- Legacy bookings (before Square deposit invoices): treat as confirmed.
UPDATE public.bookings b
SET deposit_paid_at = b.created_at
WHERE b.deposit_paid_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.booking_id = b.id);

-- Bookings with a recorded deposit payment.
UPDATE public.bookings b
SET deposit_paid_at = i.created_at
FROM public.invoices i
WHERE i.booking_id = b.id
  AND i.invoice_type = 'deposit'
  AND b.deposit_paid_at IS NULL;

-- Remaining rows (abandoned checkout) keep deposit_paid_at NULL and no longer block slots.

CREATE OR REPLACE FUNCTION public.get_booked_times(p_date date)
RETURNS TABLE(slot_time text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT b.time AS slot_time
  FROM public.bookings b
  WHERE b.date = p_date
    AND b.deposit_paid_at IS NOT NULL;
$$;

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
  p_client_ip text DEFAULT NULL,
  p_pending_deposit boolean DEFAULT false
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
    client_ip,
    deposit_paid_at
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
    NULLIF(trim(COALESCE(p_client_ip, '')), ''),
    CASE WHEN COALESCE(p_pending_deposit, false) THEN NULL ELSE NOW() END
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_booking_from_client(
  text, date, text, text, text, text, text, text, boolean, text, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_booking_from_client(
  text, date, text, text, text, text, text, text, boolean, text, boolean
) TO anon, authenticated;
