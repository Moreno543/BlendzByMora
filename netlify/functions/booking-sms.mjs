/**
 * Send Twilio SMS after a booking is saved (triggered from the site with booking UUID).
 * Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER (E.164),
 *      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: TWILIO_SMS_DISABLED=true to skip sending (e.g. while testing)
 */
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function toE164(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function buildBody(row) {
  const name = String(row.name || 'there').trim();
  const first = name.split(/\s+/)[0] || 'there';
  const service = String(row.service || 'Appointment').slice(0, 80);
  const date = String(row.date || '');
  const time = String(row.time || '');
  let text = `Blendz By Mora: Hi ${first}! We received your request — ${service} on ${date} at ${time}. We'll confirm by email or phone. Reminder ~24h before appt. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`;
  if (text.length > 320) {
    text = `Blendz By Mora: Hi ${first}! Request: ${service} on ${date} at ${time}. We'll confirm soon. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`;
  }
  if (text.length > 320) {
    text = text.slice(0, 317) + '...';
  }
  return text;
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (String(process.env.TWILIO_SMS_DISABLED || '').toLowerCase() === 'true') {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'disabled' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromNum = process.env.TWILIO_FROM_NUMBER;
  const url = process.env.SUPABASE_URL;
  const skey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!sid || !token || !fromNum || !url || !skey) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'missing_env' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    body = {};
  }

  const bookingId = typeof body?.bookingId === 'string' ? body.bookingId.trim() : '';
  if (!bookingId || !/^[0-9a-f-]{36}$/i.test(bookingId)) {
    return new Response(JSON.stringify({ error: 'Invalid bookingId' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(url, skey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: row, error: qerr } = await supabase
    .from('bookings')
    .select('id, name, phone, service, date, time, email, sms_consent')
    .eq('id', bookingId)
    .maybeSingle();

  if (qerr || !row) {
    return new Response(JSON.stringify({ error: 'Booking not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (row.sms_consent !== true) {
    return new Response(JSON.stringify({ ok: true, sent: false, reason: 'no_sms_consent' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const to = toE164(row.phone);
  if (!to) {
    return new Response(JSON.stringify({ ok: true, sent: false, reason: 'invalid_phone' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const messageBody = buildBody(row);
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const params = new URLSearchParams({ To: to, From: fromNum.trim(), Body: messageBody });

  const twRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const twJson = await twRes.json().catch(() => ({}));

  if (!twRes.ok) {
    console.error('Twilio error', twRes.status, twJson);
    return new Response(
      JSON.stringify({
        ok: false,
        error: twJson.message || 'Twilio request failed',
      }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ ok: true, sent: true, sid: twJson.sid }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
