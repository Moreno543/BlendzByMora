# 5-Minute Supabase Setup (Prevents Double Bookings)

Follow these steps to grey out booked times so no one can double-book.

---

## Step 1: Create Supabase Account

1. Go to [supabase.com](https://supabase.com)
2. Click **Start your project**

---

## Step 2: Create a New Project

1. Click **New Project**
2. Name it something like `blendzbymora`
3. Create a password (save it somewhere)
4. Choose a region (e.g. `West US` if you're in California)
5. Click **Create new project** — wait ~2 minutes for it to spin up

---

## Step 3: Create the Tables

1. In the left sidebar, click **SQL Editor**
2. Click **New query**
3. Paste this entire block:

```sql
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

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert" ON bookings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous select" ON bookings
  FOR SELECT USING (true);
```

4. Click **Run** (or press Cmd+Enter)
5. You should see "Success. No rows returned"

### Create the Reviews Table (for "What Clients Say")

1. In **SQL Editor**, click **New query**
2. Paste this:

```sql
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

3. Click **Run**
4. You should see "Success. No rows returned"

---

## Step 4: Copy Your API Keys

1. Go to **Settings** (gear icon in left sidebar)
2. Click **API** in the left menu
3. Copy these two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (long string under "Project API keys")

---

## Step 5: Add to config.js

1. Open `config.js` in your project
2. Replace the empty strings with your values:

```javascript
SUPABASE_URL: 'https://xxxxx.supabase.co',   // paste your Project URL
SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1...',   // paste your anon key
```

3. Save the file

---

## Done!

Now when someone books a time, it’s saved in Supabase. When another person selects the same date, only the **available** times are shown — booked slots are greyed out (not available).
