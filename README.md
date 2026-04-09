# Blendz By Mora

A professional makeup artistry website with booking and reviews.

## Quick Start

1. **Full local test** (site + Netlify functions + env): `npm install`, `npx netlify link`, then `npx netlify env:list --plain --context production > .env` (or copy `.env.example`), then `npm run dev`. **Twilio + Supabase service role:** see **[TWILIO_SETUP.md](./TWILIO_SETUP.md)**.

2. **Static only** (no functions): open `index.html` or run `npx serve .`

3. For **booking with double-booking prevention** and **on-site reviews**, follow the setup below.

4. **Private schedule page** (`admin.html`, today → next Friday, Las Vegas dates): see **[ADMIN_DASHBOARD.md](./ADMIN_DASHBOARD.md)** (requires Netlify + serverless function + env token).

5. **Customer list (optional):** **`customer_contacts`** in Supabase stores **name, phone, email** from the booking form (auto-filled via trigger). See **[CUSTOMER_CONTACTS.md](./CUSTOMER_CONTACTS.md)**.

6. **SMS (optional):** Twilio sends a **confirmation** after booking and a **~24h reminder**; inbound **YES** sets **`bookings.sms_confirmed_at`**. Filter confirmed appointments on **`admin.html`**. Step-by-step: **[TWILIO_SETUP.md](./TWILIO_SETUP.md)** (includes Supabase SQL).

---

## Setup: Booking & Reviews (Prevents Double Bookings)

### 1. Supabase (Free)

1. Go to [supabase.com](https://supabase.com) → Sign up → Create new project
2. In **SQL Editor**, run:

```sql
-- Bookings table
CREATE TABLE bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service TEXT NOT NULL,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  travel TEXT DEFAULT 'No',
  notes TEXT,
  client_ip TEXT,
  reminder_sent_at TIMESTAMPTZ,
  sms_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow public insert/select (for your site)
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert" ON bookings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous select" ON bookings
  FOR SELECT USING (true);

-- If you created bookings before client_ip existed, run: sql/bookings_client_ip.sql

-- Reviews table
CREATE TABLE reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  service TEXT,
  rating TEXT NOT NULL,
  review TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert reviews" ON reviews
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous select reviews" ON reviews
  FOR SELECT USING (true);
```

3. Go to **Settings → API** and copy:
   - Project URL
   - `anon` public key

4. Paste them into `config.js`:
   ```js
   SUPABASE_URL: 'https://xxxxx.supabase.co',
   SUPABASE_ANON_KEY: 'your-anon-key',
   ```

### 2. Formspree (Optional – Email Notifications)

1. Go to [formspree.io](https://formspree.io) → Sign up
2. Create a form for **Bookings**
3. Copy the form ID from the form action URL (e.g. `xyzabcde` from `formspree.io/f/xyzabcde`)
4. Add to `config.js`:
   ```js
   FORMSPREE_BOOKING_ID: 'xyzabcde',
   ```

5. (Optional) Create another form for **Reviews** and set `FORMSPREE_REVIEW_ID`.

If your form includes **travel**, add a column: `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS travel TEXT DEFAULT 'No';`

If your **reviews** form includes **service** (same options as booking), add: `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS service TEXT;`

Optional **review photos** use the **`review-images`** Storage bucket and **`image_url`** on `reviews` — set this up in Supabase as in **[SETUP_SUPABASE.md](./SETUP_SUPABASE.md)** (Storage + `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS image_url TEXT;` if needed).

---

## Booking Rules (Built-in)

- **Hours:** 8am–6pm, Monday–Saturday
- **Slots:** 8:00 AM, 10:00 AM, 12:00 PM, 2:00 PM, 4:00 PM (4pm is last booking)
- **Timezone:** Slot times use `BOOKING_TIMEZONE` in `config.js` (default `America/Los_Angeles` / Las Vegas), not the visitor’s device timezone.
- **Double booking:** Prevented when Supabase is configured

---

## Deploy

Upload the folder to:

- **Netlify** – drag & drop
- **Vercel** – `vercel .`
- **GitHub Pages** – push to a repo and enable Pages

Ensure `config.js` has your real keys before deploying.
