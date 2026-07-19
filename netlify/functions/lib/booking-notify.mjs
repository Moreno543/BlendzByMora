/**
 * Booking confirmation email + SMS (after deposit paid, or legacy immediate flow).
 */
import { hasOutboundSender, twilioMessageParams } from './twilio-send.mjs';

function env(name) {
  return String(process.env[name] ?? '').trim();
}

function toE164(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export function buildBookingSmsBody(row, { depositPaid = false, achPending = false } = {}) {
  const name = String(row.name || 'there').trim();
  const first = name.split(/\s+/)[0] || 'there';
  const service = String(row.service || 'Appointment').slice(0, 80);
  const date = String(row.date || '');
  const time = String(row.time || '');
  let text = depositPaid
    ? achPending
      ? `Blendz By Mora: Hi ${first}! Bank deposit submitted for ${date} at ${time}. Your date is secured; transfer may take 2-3 business days. Reminder ~72h before appt. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`
      : `Blendz By Mora: Hi ${first}! Deposit received — ${service} on ${date} at ${time} is secured. Reminder ~72h before appt. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`
    : `Blendz By Mora: Hi ${first}! We received your request — ${service} on ${date} at ${time}. We'll confirm by email or phone. Reminder ~72h before appt. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`;
  if (text.length > 320) {
    text = depositPaid
      ? achPending
        ? `Blendz By Mora: Hi ${first}! Bank deposit submitted for ${date} at ${time}. Date secured. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`
        : `Blendz By Mora: Hi ${first}! Deposit received for ${date} at ${time}. See you soon! Msg & data rates may apply. Reply HELP for help, STOP to opt out.`
      : `Blendz By Mora: Hi ${first}! Request: ${service} on ${date} at ${time}. We'll confirm soon. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`;
  }
  if (text.length > 320) text = text.slice(0, 317) + '...';
  return text;
}

export async function sendBookingConfirmationEmail(row, { depositPaid = false, paymentMethod = 'card', achPending = false } = {}) {
  const formspreeId = env('FORMSPREE_BOOKING_ID');
  if (!formspreeId) return { ok: true, skipped: true, reason: 'missing_env' };

  const agreementUrl = env('SERVICE_AGREEMENT_URL') || 'https://blendzbymora.com/service-agreement.html';
  const agreementVersion = env('SERVICE_AGREEMENT_VERSION') || '2026-07';
  const firstName = String(row.name || '').trim().split(/\s+/)[0] || 'there';
  const paidByAch = paymentMethod === 'ach';

  const confirmationCopy = depositPaid
    ? `Hello ${firstName},\n\n` +
      (achPending
        ? 'Thank you for booking with Blendz By Mora. Your bank transfer deposit has been submitted and your appointment is secured. Bank transfers typically take 2–3 business days to complete.\n\n'
        : paidByAch
          ? 'Thank you for booking with Blendz By Mora. Your bank transfer deposit has been received and your appointment is secured.\n\n'
          : 'Thank you for booking with Blendz By Mora. Your deposit has been received and your appointment is secured.\n\n') +
      'Below is a copy of your booking for your records.\n\n' +
      `You agreed to our Service Agreement (version ${agreementVersion}). Keep this link for your records:\n${agreementUrl}\n\n` +
      (paidByAch
        ? 'The remaining balance will be invoiced for your service date. You may pay that invoice by bank transfer (ACH) with no card processing fee, or by card (3.3% + $0.30 processing fee applies to card payments). Cash and Zelle are also accepted where agreed.\n\n'
        : 'The remaining balance will be invoiced for your service date. Card payments include a processing fee of 3.3% + $0.30 per transaction (deposit and balance are separate payments). Bank transfer (ACH) and cash/Zelle are not subject to card processing fees.\n\n') +
      'Kind regards,\nBlendz By Mora'
    : `Hello ${firstName},\n\n` +
      'Thank you for submitting an appointment request with Blendz By Mora. Below is a copy of the services you requested for your records.\n\n' +
      `You agreed to our Service Agreement (version ${agreementVersion}). Keep this link for your records:\n${agreementUrl}\n\n` +
      'To secure your appointment, a 50% deposit is due upon booking. After you submit, you can pay by card or bank transfer (ACH) on the booking page; bank transfer has no card processing fee. The remaining balance will be invoiced for your service date.\n\n' +
      'Our team will review your request and follow up shortly to confirm your appointment by email or phone.\n\n' +
      'Kind regards,\nBlendz By Mora';

  const subjectPrefix = depositPaid ? 'appointment confirmed' : 'appointment request received';
  const params = new URLSearchParams();
  params.append('Appointment confirmation', confirmationCopy);
  params.append('name', String(row.name || ''));
  params.append('email', String(row.email || ''));
  params.append('phone', String(row.phone || ''));
  params.append('service', String(row.service || ''));
  params.append('date', String(row.date || ''));
  params.append('time', String(row.time || ''));
  params.append('travel', String(row.travel || 'No'));
  if (row.notes) params.append('notes', String(row.notes));
  params.append('Service Agreement URL', agreementUrl);
  params.append('_subject', `Blendz By Mora — ${subjectPrefix} (${row.date} · ${row.time})`);
  if (row.email) params.append('_cc', String(row.email).trim());

  const res = await fetch(`https://formspree.io/f/${formspreeId}`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: params,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[booking-notify] Formspree failed', res.status, errText);
    return { ok: false, error: 'Formspree failed' };
  }

  return { ok: true, sent: true };
}

export async function sendBookingConfirmationSms(row, { depositPaid = false, achPending = false } = {}) {
  if (String(process.env.TWILIO_SMS_DISABLED || '').toLowerCase() === 'true') {
    return { ok: true, skipped: true, reason: 'disabled' };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = String(process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim();
  const fromNum = String(process.env.TWILIO_FROM_NUMBER || '').trim();

  if (!sid || !token || !hasOutboundSender(messagingServiceSid, fromNum)) {
    return { ok: true, skipped: true, reason: 'missing_env' };
  }

  if (row.sms_consent !== true) {
    return { ok: true, sent: false, reason: 'no_sms_consent' };
  }

  const to = toE164(row.phone);
  if (!to) {
    return { ok: true, sent: false, reason: 'invalid_phone' };
  }

  const messageBody = buildBookingSmsBody(row, { depositPaid, achPending });
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  let params;
  try {
    params = twilioMessageParams({
      to,
      body: messageBody,
      messagingServiceSid,
      fromNumber: fromNum,
    });
  } catch (e) {
    console.error('[booking-notify] SMS config', e);
    return { ok: false, error: 'Twilio sender not configured' };
  }

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
    console.error('[booking-notify] Twilio error', twRes.status, twJson);
    return { ok: false, error: twJson.message || 'Twilio request failed' };
  }

  return { ok: true, sent: true, sid: twJson.sid };
}

/** Email + SMS after deposit is paid (errors logged; does not throw). */
export async function notifyBookingConfirmedAfterDeposit(row, { paymentMethod = 'card', achPending = false } = {}) {
  const email = await sendBookingConfirmationEmail(row, { depositPaid: true, paymentMethod, achPending });
  const sms = await sendBookingConfirmationSms(row, { depositPaid: true, achPending });
  return { email, sms };
}
