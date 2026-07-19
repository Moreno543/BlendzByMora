-- Run once in Supabase → SQL Editor.
-- Converts invoices money columns from integer cents (5000) to dollar amounts (50.00).

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_subtotal_cents_check,
  DROP CONSTRAINT IF EXISTS invoices_tax_cents_check,
  DROP CONSTRAINT IF EXISTS invoices_total_cents_check,
  DROP CONSTRAINT IF EXISTS invoices_total_service_cents_check,
  DROP CONSTRAINT IF EXISTS invoices_deposit_cents_check,
  DROP CONSTRAINT IF EXISTS invoices_balance_cents_check;

ALTER TABLE public.invoices
  ALTER COLUMN subtotal_cents TYPE NUMERIC(10, 2)
    USING ROUND(subtotal_cents::numeric / 100, 2),
  ALTER COLUMN tax_cents TYPE NUMERIC(10, 2)
    USING ROUND(tax_cents::numeric / 100, 2),
  ALTER COLUMN total_cents TYPE NUMERIC(10, 2)
    USING ROUND(total_cents::numeric / 100, 2),
  ALTER COLUMN total_service_cents TYPE NUMERIC(10, 2)
    USING (
      CASE
        WHEN total_service_cents IS NULL THEN NULL
        ELSE ROUND(total_service_cents::numeric / 100, 2)
      END
    ),
  ALTER COLUMN deposit_cents TYPE NUMERIC(10, 2)
    USING (
      CASE
        WHEN deposit_cents IS NULL THEN NULL
        ELSE ROUND(deposit_cents::numeric / 100, 2)
      END
    ),
  ALTER COLUMN balance_cents TYPE NUMERIC(10, 2)
    USING (
      CASE
        WHEN balance_cents IS NULL THEN NULL
        ELSE ROUND(balance_cents::numeric / 100, 2)
      END
    );

ALTER TABLE public.invoices RENAME COLUMN subtotal_cents TO subtotal;
ALTER TABLE public.invoices RENAME COLUMN tax_cents TO tax;
ALTER TABLE public.invoices RENAME COLUMN total_cents TO total;
ALTER TABLE public.invoices RENAME COLUMN total_service_cents TO total_service;
ALTER TABLE public.invoices RENAME COLUMN deposit_cents TO deposit;
ALTER TABLE public.invoices RENAME COLUMN balance_cents TO balance;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_subtotal_check CHECK (subtotal >= 0),
  ADD CONSTRAINT invoices_tax_check CHECK (tax >= 0),
  ADD CONSTRAINT invoices_total_check CHECK (total >= 0),
  ADD CONSTRAINT invoices_total_service_check CHECK (total_service IS NULL OR total_service >= 0),
  ADD CONSTRAINT invoices_deposit_check CHECK (deposit IS NULL OR deposit >= 0),
  ADD CONSTRAINT invoices_balance_check CHECK (balance IS NULL OR balance >= 0);

COMMENT ON COLUMN public.invoices.subtotal IS 'Subtotal in US dollars (e.g. 50.00).';
COMMENT ON COLUMN public.invoices.tax IS 'Tax or processing fee in US dollars (e.g. 1.95).';
COMMENT ON COLUMN public.invoices.total IS 'Total charged in US dollars (e.g. 51.95).';
COMMENT ON COLUMN public.invoices.total_service IS 'Full service price in US dollars (e.g. 100.00).';
COMMENT ON COLUMN public.invoices.deposit IS 'Deposit portion in US dollars (e.g. 50.00).';
COMMENT ON COLUMN public.invoices.balance IS 'Remaining balance in US dollars (e.g. 50.00).';
