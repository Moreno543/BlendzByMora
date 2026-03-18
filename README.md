# Blendz By Mora

A professional makeup artistry website with booking and reviews.

## Quick Start

1. Open `index.html` in a browser, or serve the folder locally:
   ```bash
   npx serve .
   ```

2. For **booking with double-booking prevention** and **on-site reviews**, follow the setup below.

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
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow public insert/select (for your site)
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert" ON bookings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous select" ON bookings
  FOR SELECT USING (true);

-- Reviews table
CREATE TABLE reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  rating TEXT NOT NULL,
  review TEXT NOT NULL,
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

---

## Booking Rules (Built-in)

- **Hours:** 8am–6pm, Monday–Saturday
- **Slots:** 8:00 AM, 10:00 AM, 12:00 PM, 2:00 PM, 4:00 PM (4pm is last booking)
- **Double booking:** Prevented when Supabase is configured

---

## Deploy

Upload the folder to:

- **Netlify** – drag & drop
- **Vercel** – `vercel .`
- **GitHub Pages** – push to a repo and enable Pages

Ensure `config.js` has your real keys before deploying.
