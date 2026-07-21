/**
 * Admin: available time slots for rescheduling a paid booking on a given date.
 * POST JSON: { token, bookingId, date: "YYYY-MM-DD" }
 */
import { createClient } from '@supabase/supabase-js';
import { verifyAdminToken, adminCorsHeaders } from './lib/admin-auth.mjs';
import {
  getBookedTimesForDate,
  isValidYmd,
  slotsWithAvailability,
} from './lib/booking-slots.mjs';

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: adminCorsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (!verifyAdminToken(request, body)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const bookingId = String(body?.bookingId || '').trim();
  const date = String(body?.date || '').trim();

  if (!bookingId || !isValidYmd(date)) {
    return new Response(JSON.stringify({ error: 'bookingId and date (YYYY-MM-DD) are required.' }), {
      status: 400,
      headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return new Response(JSON.stringify({ error: 'Server missing Supabase configuration' }), {
      status: 500,
      headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, deposit_paid_at')
    .eq('id', bookingId)
    .maybeSingle();

  if (bookingErr) {
    return new Response(JSON.stringify({ error: bookingErr.message }), {
      status: 500,
      headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!booking?.id) {
    return new Response(JSON.stringify({ error: 'Booking not found.' }), {
      status: 404,
      headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!booking.deposit_paid_at) {
    return new Response(JSON.stringify({ error: 'This booking has no paid deposit and cannot be rescheduled here.' }), {
      status: 422,
      headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const booked = await getBookedTimesForDate(supabase, date, bookingId);
    const slots = slotsWithAvailability(booked);
    return new Response(
      JSON.stringify({
        ok: true,
        date,
        bookingId,
        slots,
        hasAvailable: slots.some((s) => s.available),
      }),
      { status: 200, headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Could not load slots' }), {
      status: 500,
      headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
