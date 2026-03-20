/**
 * Admin: list bookings in a date range (Las Vegas YYYY-MM-DD).
 * POST JSON: { token, start?, end? } — omit start/end for default week through next Friday.
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_DASHBOARD_TOKEN
 */
import { createClient } from '@supabase/supabase-js';
import { rangeTodayThroughNextFriday } from './lib/vegas-dates.mjs';

const SLOT_ORDER = ['8:00 AM', '10:00 AM', '12:00 PM', '2:00 PM', '4:00 PM'];
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 120;

function sortBookings(rows) {
  const rank = (t) => {
    const i = SLOT_ORDER.indexOf(t);
    return i === -1 ? 99 : i;
  };
  return [...(rows || [])].sort(
    (a, b) => String(a.date).localeCompare(String(b.date)) || rank(a.time) - rank(b.time)
  );
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
  const { start, end, label } = resolved;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return new Response(JSON.stringify({ error: 'Server missing Supabase configuration' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: true });

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
      count: bookings.length,
      bookings,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
