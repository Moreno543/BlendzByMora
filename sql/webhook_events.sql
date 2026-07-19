-- Run once in Supabase → SQL Editor.
-- Prevents duplicate refund notification emails for the same Square refund.

CREATE TABLE IF NOT EXISTS public.webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.webhook_events IS
  'Processed Square webhook event IDs (dedupe refund notification emails).';

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
