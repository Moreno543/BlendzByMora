/**
 * Admin: list bookings in a date range (Las Vegas YYYY-MM-DD).
 * POST JSON: { token, start?, end?, confirmFilter? } — omit start/end for default week through next Friday.
 * confirmFilter: "all" | "confirmed" | "unconfirmed" — filter by bookings.sms_confirmed_at (SMS YES).
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_DASHBOARD_TOKEN
 */
import { createClient } from '@supabase/supabase-js';
import { rangeTodayThroughNextFriday } from './lib/vegas-dates.mjs';

const SLOT_ORDER = ['8:00 AM', '10:00 AM', '12:00 PM', '2:00 PM', '4:00 PM'];
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 120;

/** Calendar date for sort (YYYY-MM-DD from DATE or ISO string). */
function sortDateKey(row) {
  const d = row?.date;
  if (d == null) return '';
  const s = String(d);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

/** Map time string to morning slot order (case/spacing tolerant). */
function slotRank(time) {
  const t = String(time ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (!t) return 999;
  const idx = SLOT_ORDER.findIndex((slot) => slot.toLowerCase() === t);
  return idx === -1 ? 999 : idx;
}

/** Earliest → latest by appointment date, then time of day (not booking created order). */
function sortBookings(rows) {
  return [...(rows || [])].sort((a, b) => {
    const dc = sortDateKey(a).localeCompare(sortDateKey(b));
    if (dc !== 0) return dc;
    const tr = slotRank(a.time) - slotRank(b.time);
    if (tr !== 0) return tr;
    const tc = String(a.time || '').localeCompare(String(b.time || ''), undefined, {
      numeric: true,
    });
    if (tc !== 0) return tc;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function daysInclusive(start, end) {
  const a = new Date(start + 'T12:00:00Z').getTime();
  const b = new Date(end + 'T12:00:00Z').getTime();
  return Math.floor((b - a) / 86400000) + 1;
}

function resolveRange(body) {
  const rawStart = typeof body?.start === 'string' ? body.start.trim() : '';
  const rawEnd = typeof body?.end === 'string' ? body.end.trim() : '';
  if (rawStart && rawEnd && YMD_RE.test(rawStart) && YMD_RE.test(rawEnd)) {
    if (rawStart > rawEnd) {
      return { error: 'Start date must be on or before end date.' };
    }
    const span = daysInclusive(rawStart, rawEnd);
    if (span > MAX_RANGE_DAYS) {
      return { error: `Maximum range is ${MAX_RANGE_DAYS} days.` };
    }
    return {
      start: rawStart,
      end: rawEnd,
      label: `${rawStart} → ${rawEnd} (Las Vegas calendar dates)`,
    };
  }
  if (rawStart || rawEnd) {
    return { error: 'Use YYYY-MM-DD for both start and end, or leave both empty for the default week.' };
  }
  const { start, end } = rangeTodayThroughNextFriday();
  return {
    start,
    end,
    label: `${start} → ${end} (default: today through next Friday, Las Vegas)`,
  };
}

/** Filter by SMS YES timestamp on bookings (column sms_confirmed_at). */
function resolveConfirmFilter(body) {
  const v = typeof body?.confirmFilter === 'string' ? body.confirmFilter.trim().toLowerCase() : '';
  if (v === 'confirmed' || v === 'yes') return 'confirmed';
  if (v === 'unconfirmed' || v === 'no' || v === 'pending') return 'unconfirmed';
  return 'all';
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body = {};
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch (_) {
      body = {};
    }
  }

  const expected = process.env.ADMIN_DASHBOARD_TOKEN;
  const token = request.headers.get('x-admin-token') || body?.token;

  if (!expected || token !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const resolved = resolveRange(body);
  if (resolved.error) {
    return new Response(JSON.stringify({ error: resolved.error }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { start, end, label: rangeLabel } = resolved;
  const confirmFilter = resolveConfirmFilter(body);
  const filterSuffix =
    confirmFilter === 'confirmed'
      ? ' — SMS confirmed only'
      : confirmFilter === 'unconfirmed'
        ? ' — not SMS-confirmed only'
        : '';
  const label = rangeLabel + filterSuffix;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return new Response(JSON.stringify({ error: 'Server missing Supabase configuration' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase
    .from('bookings')
    .select('id, date, time, service, name, email, phone, travel, notes, created_at, sms_confirmed_at, client_ip')
    .gte('date', start)
    .lte('date', end);

  if (confirmFilter === 'confirmed') {
    query = query.not('sms_confirmed_at', 'is', null);
  } else if (confirmFilter === 'unconfirmed') {
    query = query.is('sms_confirmed_at', null);
  }

  const { data, error } = await query.order('date', { ascending: true }).order('time', { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const bookings = sortBookings(data);
  return new Response(
    JSON.stringify({
      ok: true,
      range: { start, end, label },
      confirmFilter,
      count: bookings.length,
      bookings,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
