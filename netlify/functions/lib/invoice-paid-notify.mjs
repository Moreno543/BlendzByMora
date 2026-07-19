/**
 * Owner alerts when a client pays a Square invoice (balance or full amount).
 */
import { notifyOwnerSms } from './owner-notify.mjs';
import { hasOutboundSender } from './twilio-send.mjs';

function env(name) {
  return String(process.env[name] ?? '').trim();
}

function formatUsd(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${(n / 100).toFixed(2)}`;
}

function invoicePaidLabel(invoiceType) {
  const t = String(invoiceType || '').toLowerCase();
  if (t === 'balance') return 'Balance invoice paid';
  if (t === 'full') return 'Invoice paid in full';
  return 'Invoice payment received';
}

/**
 * @param {Record<string, unknown>} details
 */
export async function sendInvoicePaidOwnerNotifications(details) {
  const customerName = String(details.customerName || 'Client').trim();
  const service = String(details.serviceLabel || 'Makeup appointment').trim();
  const date = String(details.serviceDate || '').trim();
  const time = String(details.appointmentTime || '').trim();
  const when = [date, time].filter(Boolean).join(' at ') || '—';
  const amountLabel = formatUsd(details.amountCents);
  const invoiceNumber = String(details.invoiceNumber || '').trim();
  const invoiceType = String(details.invoiceType || '').trim();
  const paidLabel = invoicePaidLabel(invoiceType);

  const summary =
    `${paidLabel}: ${customerName} — ${service} — ${amountLabel} received.\n` +
    `Appointment: ${when}.\n` +
    (invoiceNumber ? `Square invoice #${invoiceNumber}.` : '');

  const smsBody = `${paidLabel}: ${customerName} paid ${amountLabel} for ${service} on ${when}.`.slice(
    0,
    320
  );

  let emailSent = false;
  const formspreeId = env('FORMSPREE_BOOKING_ID');
  if (formspreeId) {
    const params = new URLSearchParams();
    params.append('_subject', `Blendz By Mora — ${paidLabel} — ${customerName} (${amountLabel})`);
    params.append('Invoice payment notification', summary);
    params.append('name', customerName);
    params.append('email', String(details.customerEmail || ''));
    params.append('phone', String(details.customerPhone || ''));
    params.append('service', service);
    params.append('date', date);
    params.append('time', time);
    params.append('amount_paid', amountLabel);
    if (invoiceNumber) params.append('invoice_number', invoiceNumber);

    const res = await fetch(`https://formspree.io/f/${formspreeId}`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: params,
    });
    emailSent = res.ok;
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[invoice-paid-notify] Formspree failed', res.status, errText);
    }
  }

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
    const sms = await notifyOwnerSms({
      sid,
      token,
      messagingServiceSid,
      fromNum,
      to: ownerPhone,
      body: smsBody,
    });
    smsSent = sms.ok === true;
    if (!smsSent) {
      console.warn('[invoice-paid-notify] owner SMS failed', sms);
    }
  }

  return {
    ok: emailSent || smsSent,
    emailSent,
    smsSent,
    skipped: !emailSent && !smsSent,
  };
}
