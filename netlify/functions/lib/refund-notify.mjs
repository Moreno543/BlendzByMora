/**
 * Refund notification emails via Formspree (owner inbox + customer CC — same as booking).
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
  if (last4) return `Your ${brand} card ending in ${last4}`;
  return 'Your original payment method';
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
  const customerEmail = String(details.customerEmail || '').trim();

  const refundCopy =
    `Hello ${first},\n\n` +
    `Your refund of ${amountLabel} is now complete. ${cardRefundPhrase(details)} should see this reflected on your statement within the next 2–7 business days.\n\n` +
    `Appointment: ${service}${when ? ` on ${when}` : ''}.\n\n` +
    'If you have any questions, reply to this email or contact us at BlendzByMora@gmail.com.\n\n' +
    'Kind regards,\nBlendz By Mora';

  const params = new URLSearchParams();
  params.append('Refund notification', refundCopy);
  params.append('name', customerName);
  params.append('email', customerEmail);
  params.append('phone', String(details.customerPhone || ''));
  params.append('service', service);
  params.append('date', date);
  params.append('time', time);
  params.append('refund_amount', amountLabel);
  if (reason) params.append('refund_reason', reason);
  params.append('_subject', `Blendz By Mora — refund issued (${amountLabel}) — ${customerName}`);
  if (customerEmail) params.append('_cc', customerEmail);

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
