/**
 * Notify business owner when a client confirms via SMS (YES).
 * SMS: TWILIO_OWNER_NOTIFY_PHONE (E.164, e.g. +17253527193)
 * Email: FORMSPREE_BOOKING_ID → delivers to the Formspree form inbox (BlendzByMora@gmail.com)
 */
import { hasOutboundSender, twilioMessageParams } from './twilio-send.mjs';

export function buildOwnerConfirmSummary(match, from) {
  return `Client confirmed via SMS (YES): ${match.name} — ${match.service} on ${match.date} at ${match.time}. Phone: ${from}`;
}

export async function notifyOwnerSms({ sid, token, messagingServiceSid, fromNum, to, body }) {
  if (!to || !hasOutboundSender(messagingServiceSid, fromNum)) return { ok: false, skipped: true };
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const form = twilioMessageParams({
    to,
    body: body.slice(0, 320),
    messagingServiceSid,
    fromNumber: fromNum,
  });
  const twRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const json = await twRes.json().catch(() => ({}));
  return { ok: twRes.ok, json };
}

export async function notifyOwnerEmail(formId, summary, match) {
  if (!formId) return { ok: false, skipped: true };
  const res = await fetch(`https://formspree.io/f/${formId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      _subject: `SMS YES — ${match.name} confirmed (${match.date} ${match.time})`,
      _replyto: 'noreply@blendzbymora.com',
      event: 'sms_confirmation',
      name: match.name,
      service: match.service,
      date: match.date,
      time: match.time,
      phone: match.phone,
      message: summary,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, text };
  }
  return { ok: true };
}
