/**
 * Refund notification emails via Formspree (owner inbox + customer CC copy).
 */

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
  if (last4) return `The ${brand} card ending in ${last4}`;
  return 'The original payment method';
}

/**
 * @param {Record<string, unknown>} details
 */
export async function sendRefundNotificationEmails(details) {
  const formspreeId = env('FORMSPREE_BOOKING_ID');
  if (!formspreeId) return { ok: true, skipped: true, reason: 'missing_env' };

  const amountLabel = formatUsd(details.amountCents);
  const customerName = String(details.customerName || 'Client').trim();
  const first = firstName(customerName);
  const service = String(details.serviceLabel || 'Makeup appointment').trim();
  const date = String(details.serviceDate || '').trim();
  const time = String(details.appointmentTime || '').trim();
  const when = [date, time].filter(Boolean).join(' at ') || 'your appointment';
  const reason = String(details.reason || '').trim();
  const refundId = String(details.refundId || '').trim();
  const paymentId = String(details.paymentId || '').trim();
  const customerEmail = String(details.customerEmail || '').trim();

  const customerCopy =
    `Hello ${first},\n\n` +
    `This confirms that a refund of ${amountLabel} has been issued to your original payment method for your Blendz By Mora appointment (${service}${when ? ` on ${when}` : ''}).\n\n` +
    'Please allow 2–10 business days for your bank or card issuer to post the credit.\n\n' +
    'If you have any questions, reply to this email or contact us at BlendzByMora@gmail.com.\n\n' +
    'Kind regards,\nBlendz By Mora';

  const ownerCopy =
    `Hello ${customerName},\n\n` +
    `The ${amountLabel} refund you requested is now complete. ${cardRefundPhrase(details)} should see this reflected on their statement within the next 2–7 business days.\n\n` +
    `Client: ${customerName}\n` +
    `Email: ${details.customerEmail || '—'}\n` +
    `Phone: ${details.customerPhone || '—'}\n` +
    `Service: ${service}\n` +
    `Appointment: ${when || '—'}\n` +
    (reason ? `Reason: ${reason}\n` : '') +
    (refundId ? `Square refund ID: ${refundId}\n` : '') +
    (paymentId ? `Square payment ID: ${paymentId}\n` : '') +
    (customerEmail
      ? '\nThe client was CC’d on this notification.'
      : '\nNo client email was on file — only this owner copy was sent.') +
    '\n\nThanks,\nBlendz By Mora';

  const params = new URLSearchParams();
  params.append('_subject', `Blendz By Mora — refund issued (${amountLabel}) — ${customerName}`);
  params.append('Refund notification (client copy)', customerCopy);
  params.append('Refund notification (owner)', ownerCopy);
  params.append('name', customerName);
  params.append('email', String(details.customerEmail || ''));
  params.append('phone', String(details.customerPhone || ''));
  params.append('service', service);
  params.append('date', date);
  params.append('time', time);
  params.append('refund_amount', amountLabel);
  if (reason) params.append('refund_reason', reason);
  if (refundId) params.append('square_refund_id', refundId);
  if (paymentId) params.append('square_payment_id', paymentId);

  if (customerEmail) {
    params.append('_cc', customerEmail);
  }

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

  return { ok: true, sent: true, customerCc: Boolean(customerEmail) };
}
