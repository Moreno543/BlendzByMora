/**
 * Scheduled: send Twilio SMS ~24h before each appointment (Las Vegas slot times).
 * Requires: reminder_sent_at column on bookings (see TWILIO_BOOKING_SMS.md).
 * Schedule: netlify.toml [functions.booking-reminders] schedule = hourly UTC.
 */
import { createClient } from '@supabase/supabase-js';
import {
  BOOKING_TIMEZONE,
  parseSlotDateTime,
  vegasCalendarDateStr,
} from './lib/booking-time.mjs';

/** Send when appointment is between 23h and 25h from now (hourly cron tolerance). */
const WINDOW_MIN_MS = 23 * 60 * 60 * 1000;
const WINDOW_MAX_MS = 25 * 60 * 60 * 1000;

function toE164(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function buildReminderBody(row) {
  const name = String(row.name || 'there').trim();
  const first = name.split(/\s+/)[0] || 'there';
  const service = String(row.service || 'your appointment').slice(0, 80);
  const date = String(row.date || '');
  const time = String(row.time || '');
  let text = `Blendz By Mora: Hi ${first}! Reminder — ${service} on ${date} at ${time} is in about 24 hours. See you soon! Reply if you need to reschedule.`;
  if (text.length > 320) {
    text = `Blendz By Mora: Hi ${first}! Reminder: ${service} ${date} at ${time} (~24 hrs). See you soon!`;
  }
  if (text.length > 320) {
    text = text.slice(0, 317) + '...';
  }
  return text;
}

async function sendTwilioSms({ sid, token, fromNum, to, body }) {
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const params = new URLSearchParams({ To: to, From: fromNum.trim(), Body: body });
  const twRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const twJson = await twRes.json().catch(() => ({}));
  return { ok: twRes.ok, twJson };
}

export default async function handler() {
  if (String(process.env.TWILIO_SMS_DISABLED || '').toLowerCase() === 'true') {
    console.log('[booking-reminders] skipped: TWILIO_SMS_DISABLED');
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'disabled' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromNum = process.env.TWILIO_FROM_NUMBER;
  const url = process.env.SUPABASE_URL;
  const skey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!sid || !token || !fromNum || !url || !skey) {
    console.log('[booking-reminders] skipped: missing env');
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'missing_env' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = Date.now();
  const minDate = vegasCalendarDateStr(now - 2 * 24 * 60 * 60 * 1000, BOOKING_TIMEZONE);
  const maxDate = vegasCalendarDateStr(now + 4 * 24 * 60 * 60 * 1000, BOOKING_TIMEZONE);

  const supabase = createClient(url, skey);
  const { data: rows, error: qerr } = await supabase
    .from('bookings')
    .select('id, name, phone, service, date, time, reminder_sent_at')
    .is('reminder_sent_at', null)
    .gte('date', minDate)
    .lte('date', maxDate);

  if (qerr) {
    console.error('[booking-reminders] Supabase query error', qerr);
    return new Response(JSON.stringify({ ok: false, error: qerr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const list = rows || [];
  let sent = 0;
  let skipped = 0;
  const errors = [];

  for (const row of list) {
    const appt = parseSlotDateTime(row.date, row.time, BOOKING_TIMEZONE);
    const apptMs = appt.getTime();
    if (Number.isNaN(apptMs)) {
      skipped++;
      continue;
    }
    const delta = apptMs - now;
    if (delta < WINDOW_MIN_MS || delta > WINDOW_MAX_MS) {
      skipped++;
      continue;
    }

    const to = toE164(row.phone);
    if (!to) {
      skipped++;
      continue;
    }

    const body = buildReminderBody(row);
    const { ok, twJson } = await sendTwilioSms({ sid, token, fromNum, to, body });
    if (!ok) {
      console.error('[booking-reminders] Twilio failed', row.id, twJson);
      errors.push({ id: row.id, message: twJson.message || 'twilio error' });
      continue;
    }

    const { error: uerr } = await supabase
      .from('bookings')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', row.id)
      .is('reminder_sent_at', null);

    if (uerr) {
      console.error('[booking-reminders] Failed to set reminder_sent_at', row.id, uerr);
      errors.push({ id: row.id, message: uerr.message });
      continue;
    }

    sent++;
    console.log('[booking-reminders] sent reminder', row.id, twJson.sid);
  }

  const summary = { ok: true, checked: list.length, sent, skipped, errors };
  console.log('[booking-reminders] done', summary);
  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
