/**
 * Admin: move a paid booking to a new date/time (no new deposit).
 * POST JSON: { token, bookingId, date: "YYYY-MM-DD", time: "10:00 AM" }
 */
import { createClient } from '@supabase/supabase-js';
import { verifyAdminToken, adminCorsHeaders } from './lib/admin-auth.mjs';
import {
  getBookedTimesForDate,
  isValidSlotTime,
  isValidYmd,
} from './lib/booking-slots.mjs';
import { isDateBlackedOut } from './lib/blackout-dates.mjs';
import { sendRescheduleNotifications } from './lib/reschedule-notify.mjs';

function normalizeDateField(value) {
  const s = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

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
  const newDate = String(body?.date || '').trim();
  const newTime = String(body?.time || '').trim();

  if (!bookingId || !isValidYmd(newDate) || !isValidSlotTime(newTime)) {
    return new Response(JSON.stringify({ error: 'bookingId, date (YYYY-MM-DD), and a valid time slot are required.' }), {
      status: 400,
      headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (isDateBlackedOut(newDate)) {
    return new Response(JSON.stringify({ error: 'That date is not available for appointments.' }), {
      status: 422,
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

  const { data: row, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, name, email, phone, service, date, time, travel, notes, sms_consent, deposit_paid_at')
    .eq('id', bookingId)
    .maybeSingle();

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), {
      status: 500,
      headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!row?.id) {
    return new Response(JSON.stringify({ error: 'Booking not found.' }), {
      status: 404,
      headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!row.deposit_paid_at) {
    return new Response(JSON.stringify({ error: 'This booking has no paid deposit and cannot be rescheduled here.' }), {
      status: 422,
      headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const oldDate = normalizeDateField(row.date);
  const oldTime = String(row.time || '').trim();

  if (oldDate === newDate && oldTime === newTime) {
    return new Response(JSON.stringify({ error: 'Choose a different date or time.' }), {
      status: 400,
      headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const booked = await getBookedTimesForDate(supabase, newDate, bookingId);
    if (booked.includes(newTime)) {
      return new Response(JSON.stringify({ error: 'That time is no longer available. Please choose another slot.' }), {
        status: 409,
        headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Could not verify slot' }), {
      status: 500,
      headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({
      date: newDate,
      time: newTime,
      reminder_sent_at: null,
      sms_confirmed_at: null,
    })
    .eq('id', bookingId);

  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), {
      status: 500,
      headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const notify = await sendRescheduleNotifications(
    { ...row, date: newDate, time: newTime },
    { oldDate, oldTime, newDate, newTime }
  );

  return new Response(
    JSON.stringify({
      ok: true,
      bookingId,
      oldDate,
      oldTime,
      newDate,
      newTime,
      emailSent: notify.emailSent === true,
      smsSent: notify.smsSent === true,
    }),
    { status: 200, headers: { ...adminCorsHeaders, 'Content-Type': 'application/json' } }
  );
}
