-- Manual / personal booking — blocks the slot on the website AND shows on admin.html
-- Run in Supabase → SQL Editor. Edit the values below before running.

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
  deposit_paid_at
)
VALUES (
  'Personal booking',           -- service (edit as needed)
  '2026-09-19',                 -- date
  '12:00 PM',                   -- time slot
  'Customer name',              -- client name
  'client@email.com',           -- client email
  '5551234567',                 -- client phone
  'No',                         -- travel: Yes or No
  'Booked personally (not via website).',
  false,
  NOW()                         -- marks slot as taken on booking page
);
