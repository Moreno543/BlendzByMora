/**
 * Twilio Lookup v2 — validates that a phone number is real / routable (no SMS code).
 * POST JSON: { phone: "+17025551234" } (E.164 preferred; US 10-digit ok)
 * Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 * Optional: TWILIO_LOOKUP_DISABLED=true — returns { ok: true, skipped: true } (local dev / no charge)
 */
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

  if (String(process.env.TWILIO_LOOKUP_DISABLED || '').toLowerCase() === 'true') {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return new Response(
      JSON.stringify({
        ok: true,
        skipped: true,
        message: 'Lookup not configured',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, message: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const e164 = toE164(body?.phone);
  if (!e164) {
    return new Response(
      JSON.stringify({ ok: false, message: 'Invalid phone format.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  let twilioRes;
  try {
    twilioRes = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    console.error('[lookup-phone] Twilio fetch error:', err);
    return new Response(
      JSON.stringify({
        ok: false,
        message: 'Could not verify phone right now. Please try again in a moment.',
      }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (twilioRes.status === 404) {
    return new Response(
      JSON.stringify({
        ok: false,
        message:
          'That phone number doesn’t look valid or active. Double-check the number and try again.',
      }),
      { status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  if (!twilioRes.ok) {
    let errJson = {};
    try {
      errJson = await twilioRes.json();
    } catch {
      /* ignore */
    }
    const code = errJson.code;
    const msg = errJson.message || twilioRes.statusText;
    console.warn('[lookup-phone] Twilio error:', twilioRes.status, code, msg);
    return new Response(
      JSON.stringify({
        ok: false,
        message: 'Could not verify this phone number. Please try again or use a different number.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
