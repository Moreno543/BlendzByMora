# Customer contacts table (Supabase)

Stores **name**, **phone**, and **email** from people who submit the booking form.

- **Filled automatically** when a row is inserted into **`bookings`** (database trigger). You do **not** need to change `app.js`.
- **One row per phone number** (digits only, e.g. `7025551234` and `(702) 555-1234` match). New bookings **update** name, email, and the raw phone string if the same person books again.
- **Not exposed on the website:** RLS is on with **no** anonymous policies, so the public anon key cannot read or write this table. View or export in **Supabase → Table Editor** (dashboard login) or via **service role** (e.g. future admin tool).

---

## 1. Add table + trigger (run once)

**Fastest:** open **`sql/customer_contacts.sql`** in this repo, copy **all** of it, paste into **Supabase → SQL Editor**, click **Run**.

Or paste the same SQL here:

```sql
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
```

If your Postgres version prefers it, you can use **`EXECUTE FUNCTION`** instead of **`EXECUTE PROCEDURE`** on the last line (same function name).

---

## 2. (Optional) Backfill from existing bookings

After the trigger exists, **new** bookings populate `customer_contacts` automatically. To import **past** rows (latest booking wins per phone):

```sql
INSERT INTO public.customer_contacts (name, phone, email, phone_normalized)
SELECT DISTINCT ON (regexp_replace(COALESCE(b.phone, ''), '\D', '', 'g'))
  b.name,
  b.phone,
  b.email,
  regexp_replace(COALESCE(b.phone, ''), '\D', '', 'g') AS norm
FROM public.bookings b
WHERE length(regexp_replace(COALESCE(b.phone, ''), '\D', '', 'g')) > 0
ORDER BY norm, b.created_at DESC
ON CONFLICT (phone_normalized) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  updated_at = NOW();
```

---

## 3. View your list

**Supabase → Table Editor → `customer_contacts`**

Columns: `name`, `phone`, `email`, `phone_normalized`, `created_at`, `updated_at`.
