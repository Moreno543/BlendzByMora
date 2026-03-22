-- Run once in Supabase → SQL Editor (Table: customer_contacts + sync trigger on bookings)
-- See CUSTOMER_CONTACTS.md for optional backfill of past bookings.

-- Directory of customers (name, phone, email) from booking form
CREATE TABLE IF NOT EXISTS customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_contacts_phone_norm_uq UNIQUE (phone_normalized)
);

ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sync_customer_contact_from_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm TEXT;
BEGIN
  norm := regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g');
  IF norm = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.customer_contacts (name, phone, email, phone_normalized)
  VALUES (NEW.name, NEW.phone, NEW.email, norm)
  ON CONFLICT (phone_normalized)
  DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_sync_customer_contact ON public.bookings;
CREATE TRIGGER trg_bookings_sync_customer_contact
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_customer_contact_from_booking();
