-- Run once in Supabase → SQL Editor.
-- Stores Square balance invoices and card deposit payments linked to bookings.

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('square_invoice', 'deposit_payment')),
  invoice_type TEXT NOT NULL CHECK (invoice_type IN ('balance', 'deposit', 'full')),
  square_invoice_id TEXT,
  square_payment_id TEXT,
  square_order_id TEXT,
  square_customer_id TEXT,
  invoice_number TEXT,
  status TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  service_label TEXT,
  service_date DATE,
  appointment_time TEXT,
  description TEXT,
  line_item_name TEXT,
  line_item_note TEXT,
  subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
  tax NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
  total_service NUMERIC(10, 2) CHECK (total_service IS NULL OR total_service >= 0),
  deposit NUMERIC(10, 2) CHECK (deposit IS NULL OR deposit >= 0),
  balance NUMERIC(10, 2) CHECK (balance IS NULL OR balance >= 0),
  due_date DATE,
  public_url TEXT,
  square_environment TEXT NOT NULL DEFAULT 'production',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoices_square_ref_check CHECK (
    square_invoice_id IS NOT NULL OR square_payment_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_square_invoice_id_key
  ON public.invoices (square_invoice_id)
  WHERE square_invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_square_payment_id_key
  ON public.invoices (square_payment_id)
  WHERE square_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoices_booking_id_idx ON public.invoices (booking_id);
CREATE INDEX IF NOT EXISTS invoices_service_date_idx ON public.invoices (service_date);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON public.invoices (status);

COMMENT ON TABLE public.invoices IS
  'Square balance invoices and card deposit payments for Blendz By Mora bookings.';

CREATE OR REPLACE FUNCTION public.invoices_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_updated_at ON public.invoices;
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE PROCEDURE public.invoices_set_updated_at();

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: Netlify functions use the service role key.
