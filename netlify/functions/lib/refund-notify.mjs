/**
 * Refund notification emails via Formspree (owner inbox + customer CC).
 */
import { hasOutboundSender } from './twilio-send.mjs';
import { notifyOwnerSms } from './owner-notify.mjs';
import { postFormspreeJson } from './formspree-post.mjs';

function env(name) {
  return String(process.env[name] ?? '').trim();
}

function formatUsd(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${(n / 100).toFixed(2)}`;
}

function firstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || 'there';
}

function formatCardBrand(brand) {
  const key = String(brand || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  const labels = {
    AMERICAN_EXPRESS: 'American Express',
    AMEX: 'American Express',
    VISA: 'Visa',
    MASTERCARD: 'Mastercard',
    DISCOVER: 'Discover',
    DISCOVER_DINERS: 'Discover Diners',
    JCB: 'JCB',
    CHINA_UNIONPAY: 'UnionPay',
    SQUARE_GIFT_CARD: 'Square gift card',
  };
  if (labels[key]) return labels[key];
  if (!key) return 'card';
  return key
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function cardRefundPhrase(details) {
  const brand = formatCardBrand(details.cardBrand);
  const last4 = String(details.cardLast4 || '').trim();
  if (last4) return `Your ${brand} card ending in ${last4}`;
  return 'Your original payment method';
}

function buildCustomerRefundCopy(details, amountLabel) {
  const first = firstName(details.customerName);
  const service = String(details.serviceLabel || 'Makeup appointment').trim();
  const date = String(details.serviceDate || '').trim();
  const time = String(details.appointmentTime || '').trim();
  const when = [date, time].filter(Boolean).join(' at ') || 'your appointment';

  return (
    `Hello ${first},\n\n` +
    `Your refund of ${amountLabel} is now complete. ${cardRefundPhrase(details)} should see this reflected on your statement within the next 2–7 business days.\n\n` +
    `Appointment: ${service}${when ? ` on ${when}` : ''}.\n\n` +
    'If you have any questions, reply to this email or contact us at BlendzByMora@gmail.com.\n\n' +
    'Kind regards,\nBlendz By Mora'
  );
}

/**
 * @param {Record<string, unknown>} details
 */
export async function sendRefundNotificationEmails(details) {
  const formspreeId = env('FORMSPREE_REFUND_ID') || env('FORMSPREE_BOOKING_ID');
  if (!formspreeId) return { ok: true, skipped: true, reason: 'missing_env' };

  const amountLabel = formatUsd(details.amountCents);
  const customerName = String(details.customerName || 'Client').trim();
  const service = String(details.serviceLabel || 'Makeup appointment').trim();
  const date = String(details.serviceDate || '').trim();
  const time = String(details.appointmentTime || '').trim();
  const customerEmail = String(details.customerEmail || '').trim();
  const ownerFallback = env('FORMSPREE_OWNER_EMAIL') || 'BlendzByMora@gmail.com';
  const when = [date, time].filter(Boolean).join(' · ') || date || 'appointment';

  const customerCopy = buildCustomerRefundCopy(details, amountLabel);

  // One customer-facing block only — no owner summary or extra fields that Formspree lists below the message.
  const fields = {
    'Customer refund confirmation': customerCopy,
    email: customerEmail || ownerFallback,
    _subject: `Blendz By Mora — refund confirmation (${when})`,
    _replyto: customerEmail || ownerFallback,
  };

  if (customerEmail) fields._cc = customerEmail;

  const email = await postFormspreeJson(formspreeId, fields);

  let smsSent = false;
  const ownerPhone = env('TWILIO_OWNER_NOTIFY_PHONE');
  const sid = env('TWILIO_ACCOUNT_SID');
  const token = env('TWILIO_AUTH_TOKEN');
  const messagingServiceSid = env('TWILIO_MESSAGING_SERVICE_SID');
  const fromNum = env('TWILIO_FROM_NUMBER');

  if (
    ownerPhone &&
    sid &&
    token &&
    hasOutboundSender(messagingServiceSid, fromNum) &&
    String(process.env.TWILIO_SMS_DISABLED || '').toLowerCase() !== 'true'
  ) {
    const smsBody = `Refund issued: ${customerName} — ${amountLabel} for ${service}.`.slice(0, 320);
    const sms = await notifyOwnerSms({
      sid,
      token,
      messagingServiceSid,
      fromNum,
      to: ownerPhone,
      body: smsBody,
    });
    smsSent = sms.ok === true;
  }

  return {
    ok: email.ok || smsSent,
    sent: email.sent === true,
    customerCc: Boolean(customerEmail),
    smsSent,
  };
}
