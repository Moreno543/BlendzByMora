/**
 * Twilio inbound SMS: customer replies YES (etc.) → sets bookings.sms_confirmed_at.
 * Optional: SMS your cell (TWILIO_OWNER_NOTIFY_PHONE) when someone confirms.
 *
 * Twilio → Phone Numbers → [number] → A message comes in → Webhook POST:
 *   https://YOUR_DOMAIN/.netlify/functions/twilio-inbound-sms
 *
 * Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID and/or TWILIO_FROM_NUMBER,
 *      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      optional TWILIO_OWNER_NOTIFY_PHONE (E.164)
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { vegasTodayYmd, addVegasDays } from './lib/vegas-dates.mjs';
import { hasOutboundSender, twilioMessageParams } from './lib/twilio-send.mjs';

const CONFIRM_RE = /^(yes|y|confirm|confirmed|ok|okay|si|sí)\s*\.?$/i;

function twilioXml(body) {
  const esc = String(body)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc}</Message></Response>`;
}

function normalizePhoneDigits(s) {
  const d = String(s || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) return d.slice(1);
  return d.slice(-10);
}

function validateTwilioRequest(authToken, signature, fullUrl, params) {
  if (!authToken || !signature) return false;
  const keys = Object.keys(params).sort();
  let data = fullUrl;
  for (const k of keys) data += k + (params[k] ?? '');
  const mac = createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(mac));
  } catch {
    return false;
  }
}

function parseFormBody(raw) {
  const params = {};
  if (!raw || typeof raw !== 'string') return params;
  const q = new URLSearchParams(raw);
  for (const [k, v] of q) params[k] = v;
  return params;
}

function webhookFullUrl(request) {
  const u = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto') || u.protocol.replace(':', '') || 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || u.host;
  return `${proto}://${host}${u.pathname}`;
}

/** Twilio signs the exact URL configured in Console; try www / non-www if host differs. */
function candidateWebhookUrls(fullUrl) {
  const out = new Set([fullUrl]);
  try {
    const u = new URL(fullUrl);
    const h = u.hostname;
    if (h.startsWith('www.')) {
      u.hostname = h.slice(4);
    } else {
      u.hostname = `www.${h}`;
    }
    out.add(u.toString());
  } catch (_) {}
  return [...out];
}

async function sendTwilioSms({ sid, token, messagingServiceSid, fromNum, to, body }) {
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const form = twilioMessageParams({
    to,
    body,
    messagingServiceSid,
    fromNumber: fromNum,
  });
  const twRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  return { ok: twRes.ok, json: await twRes.json().catch(() => ({})) };
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = String(process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim();
  const fromNum = String(process.env.TWILIO_FROM_NUMBER || '').trim();
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerNotify = (process.env.TWILIO_OWNER_NOTIFY_PHONE || '').trim();

  if (!sid || !token || !supabaseUrl || !serviceKey) {
    console.error('[twilio-inbound-sms] missing env');
    return new Response(twilioXml('Service unavailable.'), {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
  }

  const rawBody = await request.text();
  const params = parseFormBody(rawBody);
  const sig = request.headers.get('x-twilio-signature') || '';
  const fullUrl = webhookFullUrl(request);

  const urls = candidateWebhookUrls(fullUrl);
  const signatureOk = urls.some((u) => validateTwilioRequest(token, sig, u, params));
  if (!signatureOk) {
    console.warn('[twilio-inbound-sms] bad signature', { tried: urls });
    return new Response('Forbidden', { status: 403 });
  }

  const from = (params.From || '').trim();
  const bodyText = (params.Body || '').trim();
  const fromDigits = normalizePhoneDigits(from);

  const xml = (msg) =>
    new Response(twilioXml(msg), { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });

  if (!fromDigits || fromDigits.length < 10) {
    return xml("We couldn't read your number. Please call or email us.");
  }

  if (!CONFIRM_RE.test(bodyText)) {
    return xml('Reply YES to confirm your appointment.');
  }

  const today = vegasTodayYmd();
  const end = addVegasDays(today, 30);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error: qerr } = await supabase
    .from('bookings')
    .select('id,name,phone,service,date,time')
    .gte('date', today)
    .lte('date', end)
    .order('date', { ascending: true })
    .order('time', { ascending: true });

  if (qerr) {
    console.error('[twilio-inbound-sms] supabase', qerr);
    return xml('Something went wrong. Please contact us directly.');
  }

  const match = (rows || []).find((r) => normalizePhoneDigits(r.phone) === fromDigits);
  if (!match) {
    return xml("We don't see an upcoming appointment for this number. Email BlendzByMora@gmail.com or call us.");
  }

  const nowIso = new Date().toISOString();
  const { error: uerr } = await supabase
    .from('bookings')
    .update({ sms_confirmed_at: nowIso })
    .eq('id', match.id);

  if (uerr) {
    console.error('[twilio-inbound-sms] update booking', uerr);
    return xml('Could not save confirmation. Please email us.');
  }

  if (ownerNotify && hasOutboundSender(messagingServiceSid, fromNum)) {
    const summary = `Confirmed: ${match.name} — ${match.service} on ${match.date} ${match.time}. Phone: ${from}`;
    try {
      const { ok, json } = await sendTwilioSms({
        sid,
        token,
        messagingServiceSid,
        fromNum,
        to: ownerNotify,
        body: summary.slice(0, 320),
      });
      if (!ok) console.error('[twilio-inbound-sms] owner notify failed', json);
    } catch (e) {
      console.error('[twilio-inbound-sms] owner notify', e);
    }
  }

  return xml("Thanks! You're confirmed — we'll see you at your appointment.");
}
