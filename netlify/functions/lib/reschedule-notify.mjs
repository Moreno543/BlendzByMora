/**
 * Reschedule confirmation — Formspree email (owner inbox + customer CC) + optional SMS.
 */
import { postFormspreeJson } from './formspree-post.mjs';
import { hasOutboundSender, twilioMessageParams } from './twilio-send.mjs';

function env(name) {
  return String(process.env[name] ?? '').trim();
}

function firstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || 'there';
}

function toE164(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function buildRescheduleEmailCopy(row, { oldDate, oldTime, newDate, newTime }) {
  const first = firstName(row.name);
  const service = String(row.service || 'Makeup appointment').trim();

  return (
    `Hello ${first},\n\n` +
    'Your appointment with Blendz By Mora has a new date and time.\n\n' +
    `Previous: ${oldDate} at ${oldTime}\n` +
    `Updated appointment: ${newDate} at ${newTime}\n` +
    `Service: ${service}\n\n` +
    'Your deposit remains applied — no additional deposit is required.\n\n' +
    'The balance may be paid before or on the day of service. We accept credit and debit cards, cash, and Zelle.\n\n' +
    'If you have any questions, reply to this email.\n\n' +
    'Kind regards,\nBlendz By Mora'
  );
}

export function buildRescheduleSmsBody(row, { newDate, newTime }) {
  const first = firstName(row.name);
  let text = `Blendz By Mora: Hi ${first}! Your appointment is rescheduled to ${newDate} at ${newTime}. Your deposit still applies. Reminder ~72h before. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`;
  if (text.length > 320) {
    text = `Blendz By Mora: Hi ${first}! Rescheduled to ${newDate} at ${newTime}. Deposit still applies. Reply HELP for help, STOP to opt out.`;
  }
  if (text.length > 320) text = text.slice(0, 317) + '...';
  return text;
}

export async function sendRescheduleNotifications(row, { oldDate, oldTime, newDate, newTime }) {
  const formspreeId =
    env('FORMSPREE_RESCHEDULE_ID') || env('FORMSPREE_REFUND_ID') || env('FORMSPREE_BOOKING_ID');
  const customerEmail = String(row.email || '').trim();
  const ownerFallback = env('FORMSPREE_OWNER_EMAIL') || 'BlendzByMora@gmail.com';
  const confirmationCopy = buildRescheduleEmailCopy(row, { oldDate, oldTime, newDate, newTime });

  let emailSent = false;
  if (formspreeId) {
    const fields = {
      'Appointment confirmation': confirmationCopy,
      email: customerEmail || ownerFallback,
      _subject: `Blendz By Mora — appointment update (${newDate} · ${newTime})`,
      _replyto: customerEmail || ownerFallback,
    };
    if (customerEmail) fields._cc = customerEmail;
    const email = await postFormspreeJson(formspreeId, fields);
    emailSent = email.sent === true;
  }

  let smsSent = false;
  if (
    row.sms_consent === true &&
    String(process.env.TWILIO_SMS_DISABLED || '').toLowerCase() !== 'true'
  ) {
    const sid = env('TWILIO_ACCOUNT_SID');
    const token = env('TWILIO_AUTH_TOKEN');
    const messagingServiceSid = env('TWILIO_MESSAGING_SERVICE_SID');
    const fromNum = env('TWILIO_FROM_NUMBER');
    const to = toE164(row.phone);

    if (sid && token && to && hasOutboundSender(messagingServiceSid, fromNum)) {
      const auth = Buffer.from(`${sid}:${token}`).toString('base64');
      const params = twilioMessageParams({
        to,
        body: buildRescheduleSmsBody(row, { newDate, newTime }),
        messagingServiceSid,
        fromNumber: fromNum,
      });
      const twRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const twJson = await twRes.json().catch(() => ({}));
      smsSent = twRes.ok;
      if (!twRes.ok) {
        console.error('[reschedule-notify] Twilio failed', twRes.status, twJson);
      }
    }
  }

  return {
    ok: emailSent || smsSent,
    emailSent,
    smsSent,
    skipped: !emailSent && !smsSent,
  };
}
