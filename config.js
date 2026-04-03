/**
 * Blendz By Mora - Configuration
 * 
 * SETUP INSTRUCTIONS:
 * 
 * 1. BOOKING (prevents double bookings):
 *    - Go to https://supabase.com and create a free account
 *    - Create a new project
 *    - In SQL Editor, run:
 *      CREATE TABLE bookings (
 *        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *        service TEXT NOT NULL,
 *        date DATE NOT NULL,
 *        time TEXT NOT NULL,
 *        name TEXT NOT NULL,
 *        email TEXT NOT NULL,
 *        phone TEXT NOT NULL,
 *        notes TEXT,
 *        reminder_sent_at TIMESTAMPTZ,
 *        created_at TIMESTAMPTZ DEFAULT NOW()
 *      );
 *    - For SMS reminders, see TWILIO_SETUP.md (or ALTER bookings ADD reminder_sent_at).
 *    - Enable Row Level Security (RLS) but add policy to allow anonymous INSERT and SELECT
 *    - In Settings > API, copy your Project URL and anon/public key
 *    - Paste them below
 * 
 * 2. EMAIL NOTIFICATIONS (optional):
 *    - Go to https://formspree.io and create a free account
 *    - Create a new form and copy the form ID (e.g. xyzabcde)
 *    - Paste it in FORMSPREE_BOOKING_ID below
 *    - You'll get an email when someone books
 * 
 * 3. REVIEWS (optional):
 *    - Create a Supabase table: reviews (id, name, rating, review, created_at)
 *    - Or use Formspree for reviews - create another form and set FORMSPREE_REVIEW_ID
 */

const CONFIG = {
  // Supabase - for storing bookings & preventing double bookings
  // Get from: https://supabase.com/dashboard/project/_/settings/api
  SUPABASE_URL: 'https://gfjqzgbrzaysonhbliub.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_bHIvubz7az80TlCiKl3PRA_zBOthwz0',

  // Formspree - sends booking requests to your email
  // Get from: https://formspree.io (create form, use form ID from form action URL)
  FORMSPREE_BOOKING_ID: 'xvzwvlyr',  // formspree.io/f/xvzwvlyr
  FORMSPREE_REVIEW_ID: '',   // Optional: for review form submissions

  // Google review link - direct link for customers to leave a review
  GOOGLE_REVIEW_URL: 'https://g.page/r/CShCAdf8bWHkEBM/review',
  // Or use Place ID for direct writereview link: https://developers.google.com/maps/documentation/places/web-service/place-id
  GOOGLE_PLACE_ID: '',

  // Appointment times (8am / 10am / …) are interpreted in this timezone (Las Vegas).
  // Keeps “today / past slot” logic correct even if the visitor’s device is set elsewhere.
  BOOKING_TIMEZONE: 'America/Los_Angeles',

  // Blackout: Mon–Thu from May 4 – Oct 28, 2026
  BLACKOUT_RANGE: {
    start: '2026-05-04',
    end: '2026-10-28',
    blockWeekdays: [1, 2, 3, 4],  // Monday through Thursday
  },

  // Blackout: specific dates (April 6–10, 2026 + 2026 federal holidays)
  BLACKOUT_DATES: [
    '2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10',  // April 6–10
    '2026-01-01',   // New Year's Day
    '2026-01-19',   // Martin Luther King Jr. Day
    '2026-02-16',   // Presidents' Day
    '2026-05-25',   // Memorial Day
    '2026-06-19',   // Juneteenth
    '2026-07-04',   // Independence Day
    '2026-09-07',   // Labor Day
    '2026-10-12',   // Columbus Day
    '2026-11-11',   // Veterans Day
    '2026-11-26',   // Thanksgiving
    '2026-12-25',   // Christmas
  ],
};
