/**
 * Refund notification emails via Formspree (owner inbox + customer copy).
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

function cardRefundPhrase(details, { forCustomer = false } = {}) {
  const brand = formatCardBrand(details.cardBrand);
  const last4 = String(details.cardLast4 || '').trim();
  if (last4) {
    return forCustomer
      ? `Your ${brand} card ending in ${last4}`
      : `The ${brand} card ending in ${last4}`;
  }
  return forCustomer ? 'Your original payment method' : 'The original payment method';
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
    `Your refund of ${amountLabel} is now complete. ${cardRefundPhrase(details, { forCustomer: true })} should see this reflected on your statement within the next 2–7 business days.\n\n` +
    `Appointment: ${service}${when ? ` on ${when}` : ''}.\n\n` +
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
      ? '\nThe client was sent a separate refund confirmation email.'
      : '\nNo client email was on file — only this owner copy was sent.') +
    '\n\nThanks,\nBlendz By Mora';

  const ownerParams = new URLSearchParams();
  ownerParams.append('_subject', `Blendz By Mora — refund issued (${amountLabel}) — ${customerName}`);
  ownerParams.append('Refund notification', ownerCopy);
  ownerParams.append('name', customerName);
  ownerParams.append('email', customerEmail);
  ownerParams.append('phone', String(details.customerPhone || ''));
  ownerParams.append('service', service);
  ownerParams.append('date', date);
  ownerParams.append('time', time);
  ownerParams.append('refund_amount', amountLabel);
  if (reason) ownerParams.append('refund_reason', reason);
  if (refundId) ownerParams.append('square_refund_id', refundId);
  if (paymentId) ownerParams.append('square_payment_id', paymentId);

  const ownerResult = await postFormspree(formspreeId, ownerParams);
  if (!ownerResult.ok) return ownerResult;

  let customerSent = false;
  if (customerEmail) {
    const customerParams = new URLSearchParams();
    customerParams.append(
      '_subject',
      `Blendz By Mora — your refund of ${amountLabel} is complete`
    );
    customerParams.append('Refund notification', customerCopy);
    customerParams.append('name', customerName);
    customerParams.append('email', customerEmail);
    customerParams.append('phone', String(details.customerPhone || ''));
    customerParams.append('service', service);
    customerParams.append('date', date);
    customerParams.append('time', time);
    customerParams.append('refund_amount', amountLabel);
    customerParams.append('_cc', customerEmail);
    if (refundId) customerParams.append('square_refund_id', refundId);

    const customerResult = await postFormspree(formspreeId, customerParams);
    customerSent = customerResult.sent === true;
    if (!customerResult.ok) {
      console.error('[refund-notify] customer email failed', customerEmail);
    }
  }

  return {
    ok: true,
    sent: true,
    customerSent,
    customerCc: customerSent,
  };
}
