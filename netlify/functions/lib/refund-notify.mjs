/**
 * Refund notification emails via Formspree (owner inbox + customer CC — same as booking).
 */
import { hasOutboundSender } from './twilio-send.mjs';
import { notifyOwnerSms } from './owner-notify.mjs';

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

function buildOwnerRefundSummary(details, amountLabel) {
  const customerName = String(details.customerName || 'Client').trim();
  const service = String(details.serviceLabel || 'Makeup appointment').trim();
  const date = String(details.serviceDate || '').trim();
  const time = String(details.appointmentTime || '').trim();
  const when = [date, time].filter(Boolean).join(' at ') || '—';
  const customerEmail = String(details.customerEmail || '').trim() || '—';
  const customerPhone = String(details.customerPhone || '').trim() || '—';
  const card = cardRefundPhrase(details);
  const reason = String(details.reason || '').trim();

  return (
    `Refund issued for ${customerName} — ${amountLabel}\n\n` +
    `Client: ${customerName}\n` +
    `Email: ${customerEmail}\n` +
    `Phone: ${customerPhone}\n` +
    `Service: ${service}\n` +
    `Appointment: ${when}\n` +
    `Refund amount: ${amountLabel}\n` +
    `Payment method: ${card}\n` +
    (reason ? `Reason: ${reason}\n` : '') +
    '\nThe client has been copied on this email with their refund confirmation.'
  );
}

function buildCustomerRefundCopy(details, amountLabel) {
  const customerName = String(details.customerName || 'Client').trim();
  const first = firstName(customerName);
  const service = String(details.serviceLabel || 'Makeup appointment').trim();
  const date = String(details.serviceDate || '').trim();
  const time = String(details.appointmentTime || '').trim();
  const when = [date, time].filter(Boolean).join(' at ') || 'your appointment';

  return (
    `Hello ${first},\n\n` +
    `Your refund of ${amountLabel} is now complete. ${cardRefundPhrase(details)} should see this reflected on your statement within the next 2–7 business days.\n\n` +
    `If your original payment included a Square card processing fee, that fee is non-refundable and is not included in the refund amount.\n\n` +
    `Appointment: ${service}${when ? ` on ${when}` : ''}.\n\n` +
    'If you have any questions, reply to this email or contact us at BlendzByMora@gmail.com.\n\n' +
    'Kind regards,\nBlendz By Mora'
  );
}

async function postFormspree(formspreeId, params) {
  const res = await fetch(`https://formspree.io/f/${formspreeId}`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: params,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[refund-notify] Formspree failed', res.status, errText);
    return { ok: false, error: 'Formspree failed' };
  }
  return { ok: true, sent: true };
}

/**
 * @param {Record<string, unknown>} details
 */
export async function sendRefundNotificationEmails(details) {
  const formspreeId = env('FORMSPREE_BOOKING_ID');
  if (!formspreeId) return { ok: true, skipped: true, reason: 'missing_env' };

  const amountLabel = formatUsd(details.amountCents);
  const customerName = String(details.customerName || 'Client').trim();
  const service = String(details.serviceLabel || 'Makeup appointment').trim();
  const date = String(details.serviceDate || '').trim();
  const time = String(details.appointmentTime || '').trim();
  const reason = String(details.reason || '').trim();
  const customerEmail = String(details.customerEmail || '').trim();
  const ownerFallback = env('FORMSPREE_OWNER_EMAIL') || 'BlendzByMora@gmail.com';

  const ownerSummary = buildOwnerRefundSummary(details, amountLabel);
  const customerCopy = buildCustomerRefundCopy(details, amountLabel);

  const params = new URLSearchParams();
  params.append('Owner notification', ownerSummary);
  params.append('Customer refund confirmation', customerCopy);
  params.append('name', customerName);
  params.append('email', customerEmail || ownerFallback);
  params.append('phone', String(details.customerPhone || ''));
  params.append('service', service);
  params.append('date', date);
  params.append('time', time);
  params.append('refund_amount', amountLabel);
  if (reason) params.append('refund_reason', reason);
  params.append(
    '_subject',
    `Blendz By Mora — refund issued for ${customerName} (${amountLabel})`
  );
  if (customerEmail) {
    params.append('_cc', customerEmail);
    params.append('_replyto', customerEmail);
  }

  const email = await postFormspree(formspreeId, params);

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
