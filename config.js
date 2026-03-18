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
 *        created_at TIMESTAMPTZ DEFAULT NOW()
 *      );
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

  // Google review link (used when GOOGLE_PLACE_ID is not set)
  GOOGLE_REVIEW_URL: 'https://www.google.com/search?q=BlendzByMora&stick=H4sIAAAAAAAA_-NgU1I1qEhMSzUzNzW2tLBMSUlLszS3MqhINTEzNEtJS04xNzA0MTKyWMTK45STmpdS5VTpm1-UCADuQv8zOAAAAA&hl=en',
  // Or use Place ID for direct writereview link: https://developers.google.com/maps/documentation/places/web-service/place-id
  GOOGLE_PLACE_ID: '',
};
