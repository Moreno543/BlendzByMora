/**
 * Square webhooks — send refund confirmation email to owner + customer (Formspree CC).
 */
import { createClient } from '@supabase/supabase-js';
import { isValidSquareWebhookSignature } from './lib/square-webhook-verify.mjs';
import { sendRefundNotificationEmails } from './lib/refund-notify.mjs';
import { sendInvoicePaidOwnerNotifications } from './lib/invoice-paid-notify.mjs';
import { getSquarePayment } from './lib/square-api.mjs';
import { dollarsToCents } from './lib/money.mjs';

function env(name) {
  return String(process.env[name] ?? '').trim();
}

function extractRefund(payload) {
  const obj = payload?.data?.object;
  if (!obj || typeof obj !== 'object') return null;
  if (obj.refund && typeof obj.refund === 'object') return obj.refund;
  if (obj.id && obj.payment_id) return obj;
  return null;
}

function extractInvoice(payload) {
  const obj = payload?.data?.object;
  if (!obj || typeof obj !== 'object') return null;
  if (obj.invoice && typeof obj.invoice === 'object') return obj.invoice;
  if (obj.status && (obj.invoice_number || obj.primary_recipient || obj.payment_requests)) return obj;
  return null;
}

function refundShouldNotify(refund) {
  const status = String(refund?.status || '').toUpperCase();
  if (!status) return false;
  if (status === 'FAILED' || status === 'REJECTED' || status === 'CANCELED') return false;
  return status === 'COMPLETED' || status === 'APPROVED' || status === 'PENDING';
}

async function markRefundNotificationSent(supabase, dedupeKey) {
  if (!dedupeKey) return { ok: false };
  const { error } = await supabase.from('webhook_events').insert({
    event_id: dedupeKey,
    event_type: 'refund.notification_sent',
  });
  if (error?.code === '23505') return { ok: false, duplicate: true };
  if (error) {
    console.warn('[square-webhook] refund notify dedupe insert failed', error.message);
    return { ok: true, dedupeSkipped: true };
  }
  return { ok: true };
}

async function refundNotificationAlreadySent(supabase, dedupeKey) {
  if (!dedupeKey) return false;
  const { data } = await supabase
    .from('webhook_events')
    .select('event_id')
    .eq('event_id', dedupeKey)
    .maybeSingle();
  return Boolean(data?.event_id);
}

function invoiceRefundShouldNotify(invoice) {
  const status = String(invoice?.status || '').toUpperCase();
  return status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED';
}

function invoiceRefundAmountCents(invoice) {
  const requests = invoice?.payment_requests;
  if (!Array.isArray(requests)) return null;
  let total = 0;
  for (const req of requests) {
    const completed = req?.total_completed_amount_money?.amount;
    if (Number.isFinite(completed)) total += completed;
  }
  return total > 0 ? total : null;
}

function invoicePaidAmountCents(invoice) {
  const requests = invoice?.payment_requests;
  if (!Array.isArray(requests)) return null;
  let total = 0;
  for (const req of requests) {
    const completed = req?.total_completed_amount_money?.amount;
    if (Number.isFinite(completed)) total += completed;
  }
  return total > 0 ? total : null;
}

function invoiceIsFullyPaid(invoice) {
  return String(invoice?.status || '').toUpperCase() === 'PAID';
}

async function lookupInvoiceRecord(supabase, squareInvoiceId) {
  if (!squareInvoiceId) return null;

  const { data: invoiceRow, error } = await supabase
    .from('invoices')
    .select(
      'id, booking_id, invoice_type, status, invoice_number, customer_name, customer_email, customer_phone, service_label, service_date, appointment_time, total, balance, deposit, total_service'
    )
    .eq('square_invoice_id', squareInvoiceId)
    .maybeSingle();

  if (error) {
    console.warn('[square-webhook] invoice record lookup failed', error.message);
    return null;
  }
  return invoiceRow;
}

async function bookingDetailsFromInvoiceRow(supabase, invoiceRow) {
  if (!invoiceRow) return null;

  if (invoiceRow.customer_name || invoiceRow.customer_email) {
    return {
      customerName: invoiceRow.customer_name,
      customerEmail: invoiceRow.customer_email,
      customerPhone: invoiceRow.customer_phone,
      serviceLabel: invoiceRow.service_label,
      serviceDate: invoiceRow.service_date,
      appointmentTime: invoiceRow.appointment_time,
      bookingId: invoiceRow.booking_id,
      amountCents: dollarsToCents(invoiceRow.total),
      invoiceType: invoiceRow.invoice_type,
      invoiceNumber: invoiceRow.invoice_number,
      invoiceStatus: invoiceRow.status,
    };
  }

  if (!invoiceRow.booking_id) return null;

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, name, email, phone, service, date, time')
    .eq('id', invoiceRow.booking_id)
    .maybeSingle();

  if (!booking) return null;

  return {
    customerName: booking.name,
    customerEmail: booking.email,
    customerPhone: booking.phone,
    serviceLabel: booking.service,
    serviceDate: String(booking.date || '').slice(0, 10),
    appointmentTime: booking.time,
    bookingId: booking.id,
    amountCents: dollarsToCents(invoiceRow.total),
    invoiceType: invoiceRow.invoice_type,
    invoiceNumber: invoiceRow.invoice_number,
    invoiceStatus: invoiceRow.status,
  };
}

/** @returns {{ duplicate: boolean, dedupeSkipped?: boolean }} */
async function markWebhookProcessed(supabase, eventId, eventType) {
  const { error } = await supabase.from('webhook_events').insert({
    event_id: eventId,
    event_type: eventType,
  });
  if (error?.code === '23505') return { duplicate: true };
  if (error) {
    console.warn('[square-webhook] dedupe insert failed, continuing:', error.message);
    return { duplicate: false, dedupeSkipped: true };
  }
  return { duplicate: false };
}

async function lookupBookingForPayment(supabase, paymentId) {
  if (!paymentId) return null;

  const { data: invoiceRow, error: invoiceErr } = await supabase
    .from('invoices')
    .select(
      'booking_id, customer_name, customer_email, customer_phone, service_label, service_date, appointment_time, total, deposit'
    )
    .eq('square_payment_id', paymentId)
    .maybeSingle();

  if (invoiceErr) {
    console.warn('[square-webhook] invoice lookup failed', invoiceErr.message);
  }

  if (invoiceRow?.customer_email || invoiceRow?.customer_name) {
    return {
      customerName: invoiceRow.customer_name,
      customerEmail: invoiceRow.customer_email,
      customerPhone: invoiceRow.customer_phone,
      serviceLabel: invoiceRow.service_label,
      serviceDate: invoiceRow.service_date,
      appointmentTime: invoiceRow.appointment_time,
      bookingId: invoiceRow.booking_id,
      amountCents: dollarsToCents(invoiceRow.total ?? invoiceRow.deposit),
    };
  }

  if (invoiceRow?.booking_id) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, name, email, phone, service, date, time')
      .eq('id', invoiceRow.booking_id)
      .maybeSingle();

    if (booking) {
      return {
        customerName: booking.name,
        customerEmail: booking.email,
        customerPhone: booking.phone,
        serviceLabel: booking.service,
        serviceDate: String(booking.date || '').slice(0, 10),
        appointmentTime: booking.time,
        bookingId: booking.id,
      };
    }
  }

  return null;
}

async function lookupBookingForSquareInvoice(supabase, squareInvoiceId) {
  if (!squareInvoiceId) return null;

  const { data: invoiceRow } = await supabase
    .from('invoices')
    .select(
      'booking_id, customer_name, customer_email, customer_phone, service_label, service_date, appointment_time, total'
    )
    .eq('square_invoice_id', squareInvoiceId)
    .maybeSingle();

  if (invoiceRow?.customer_email || invoiceRow?.customer_name) {
    return {
      customerName: invoiceRow.customer_name,
      customerEmail: invoiceRow.customer_email,
      customerPhone: invoiceRow.customer_phone,
      serviceLabel: invoiceRow.service_label,
      serviceDate: invoiceRow.service_date,
      appointmentTime: invoiceRow.appointment_time,
      bookingId: invoiceRow.booking_id,
      amountCents: dollarsToCents(invoiceRow.total),
    };
  }

  if (invoiceRow?.booking_id) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, name, email, phone, service, date, time')
      .eq('id', invoiceRow.booking_id)
      .maybeSingle();
    if (booking) {
      return {
        customerName: booking.name,
        customerEmail: booking.email,
        customerPhone: booking.phone,
        serviceLabel: booking.service,
        serviceDate: String(booking.date || '').slice(0, 10),
        appointmentTime: booking.time,
        bookingId: booking.id,
        amountCents: dollarsToCents(invoiceRow.total),
      };
    }
  }

  return null;
}

function bookingFromSquareInvoice(invoice, existing) {
  const recipient = invoice?.primary_recipient || {};
  const given = String(recipient.given_name || '').trim();
  const family = String(recipient.family_name || '').trim();
  const name = [given, family].filter(Boolean).join(' ') || existing?.customerName || 'Client';

  return {
    customerName: name,
    customerEmail:
      existing?.customerEmail || String(recipient.email_address || '').trim() || null,
    customerPhone:
      existing?.customerPhone || String(recipient.phone_number || '').trim() || null,
    serviceLabel: existing?.serviceLabel || 'Makeup appointment',
    serviceDate: existing?.serviceDate || String(invoice?.sale_or_service_date || '').slice(0, 10) || null,
    appointmentTime: existing?.appointmentTime || null,
    bookingId: existing?.bookingId || null,
    amountCents: existing?.amountCents ?? invoiceRefundAmountCents(invoice),
  };
}

async function enrichFromSquarePayment(paymentId, existing) {
  const accessToken = env('SQUARE_ACCESS_TOKEN');
  if (!accessToken || !paymentId) return existing;

  try {
    const payment = await getSquarePayment({
      paymentId,
      accessToken,
      environment: env('SQUARE_ENVIRONMENT'),
    });
    if (!payment) return existing;

    const buyerEmail = String(payment.buyer_email_address || '').trim();
    const note = String(payment.note || '').trim();
    const card = payment.card_details?.card || {};

    return {
      customerName: existing?.customerName || 'Client',
      customerEmail: existing?.customerEmail || buyerEmail || null,
      customerPhone: existing?.customerPhone || null,
      serviceLabel:
        existing?.serviceLabel ||
        note.replace(/^Blendz By Mora deposit — /, '') ||
        'Makeup appointment',
      serviceDate: existing?.serviceDate || null,
      appointmentTime: existing?.appointmentTime || null,
      bookingId: existing?.bookingId || null,
      amountCents: existing?.amountCents ?? payment.amount_money?.amount ?? null,
      cardBrand: existing?.cardBrand || card.card_brand || null,
      cardLast4: existing?.cardLast4 || card.last_4 || null,
    };
  } catch (err) {
    console.warn('[square-webhook] Square payment lookup failed', err);
    return existing;
  }
}

async function handlePaymentRefund(supabase, payload, eventType) {
  const refund = extractRefund(payload);
  if (!refund?.id) {
    return { ok: true, ignored: true, reason: 'no_refund' };
  }

  if (!refundShouldNotify(refund)) {
    return { ok: true, ignored: true, status: refund.status || 'unknown' };
  }

  const refundId = String(refund.id || '').trim();
  const dedupeKey = refundId ? `refund-notify-${refundId}` : '';
  if (await refundNotificationAlreadySent(supabase, dedupeKey)) {
    return { ok: true, ignored: true, reason: 'already_notified', refundId };
  }

  const paymentId = String(refund.payment_id || '').trim();
  let booking = await lookupBookingForPayment(supabase, paymentId);
  booking = await enrichFromSquarePayment(paymentId, booking);

  const amountCents = refund.amount_money?.amount ?? refund.amount?.amount ?? booking?.amountCents ?? null;

  const notify = await sendRefundNotificationEmails({
    amountCents,
    customerName: booking?.customerName,
    customerEmail: booking?.customerEmail,
    customerPhone: booking?.customerPhone,
    serviceLabel: booking?.serviceLabel,
    serviceDate: booking?.serviceDate,
    appointmentTime: booking?.appointmentTime,
    reason: refund.reason,
    refundId: refund.id,
    paymentId,
    cardBrand: booking?.cardBrand,
    cardLast4: booking?.cardLast4,
  });

  if (notify.sent === true || notify.smsSent === true) {
    await markRefundNotificationSent(supabase, dedupeKey);
  } else if (!notify.skipped) {
    console.error('[square-webhook] refund notification not sent', {
      refundId,
      paymentId,
      customerEmail: booking?.customerEmail || null,
      notify,
    });
  }

  if (paymentId) {
    await supabase
      .from('invoices')
      .update({ status: 'REFUNDED', updated_at: new Date().toISOString() })
      .eq('square_payment_id', paymentId);
  }

  return {
    ok: true,
    eventType,
    refundId: refund.id,
    emailSent: notify.sent === true,
    customerCc: notify.customerCc === true,
    smsSent: notify.smsSent === true,
    customerEmailUsed: booking?.customerEmail || null,
  };
}

async function handleInvoicePaymentMade(supabase, payload) {
  const invoice = extractInvoice(payload);
  if (!invoice?.id) {
    return { ok: true, ignored: true, reason: 'no_invoice' };
  }

  if (!invoiceIsFullyPaid(invoice)) {
    return { ok: true, ignored: true, status: invoice.status || 'unknown', reason: 'not_fully_paid' };
  }

  const invoiceRow = await lookupInvoiceRecord(supabase, invoice.id);
  if (!invoiceRow) {
    return { ok: true, ignored: true, reason: 'unknown_invoice' };
  }

  if (String(invoiceRow.status || '').toUpperCase() === 'PAID') {
    return { ok: true, ignored: true, reason: 'already_notified' };
  }

  const invoiceType = String(invoiceRow.invoice_type || '').toLowerCase();
  if (invoiceType !== 'balance' && invoiceType !== 'full') {
    return { ok: true, ignored: true, reason: 'unsupported_invoice_type', invoiceType };
  }

  let details = await bookingDetailsFromInvoiceRow(supabase, invoiceRow);
  details = bookingFromSquareInvoice(invoice, details);
  details.invoiceType = invoiceType;
  details.invoiceNumber = invoiceRow.invoice_number || invoice.invoice_number || null;
  details.amountCents =
    dollarsToCents(invoiceRow.total) ?? invoicePaidAmountCents(invoice) ?? details.amountCents ?? null;

  const notify = await sendInvoicePaidOwnerNotifications({
    customerName: details.customerName,
    customerEmail: details.customerEmail,
    customerPhone: details.customerPhone,
    serviceLabel: details.serviceLabel,
    serviceDate: details.serviceDate,
    appointmentTime: details.appointmentTime,
    amountCents: details.amountCents,
    invoiceNumber: details.invoiceNumber,
    invoiceType,
  });

  await supabase
    .from('invoices')
    .update({ status: 'PAID', updated_at: new Date().toISOString() })
    .eq('square_invoice_id', invoice.id);

  return {
    ok: true,
    eventType: 'invoice.payment_made',
    invoiceId: invoice.id,
    emailSent: notify.emailSent === true,
    smsSent: notify.smsSent === true,
  };
}

async function handleInvoiceRefunded(supabase, payload, eventType) {
  const invoice = extractInvoice(payload);
  if (!invoice?.id) {
    return { ok: true, ignored: true, reason: 'no_invoice' };
  }

  if (!invoiceRefundShouldNotify(invoice)) {
    return { ok: true, ignored: true, status: invoice.status || 'unknown' };
  }

  const dedupeKey = `invoice-refund-notify-${invoice.id}`;
  if (await refundNotificationAlreadySent(supabase, dedupeKey)) {
    return { ok: true, ignored: true, reason: 'already_notified', invoiceId: invoice.id };
  }

  let booking = await lookupBookingForSquareInvoice(supabase, invoice.id);
  booking = bookingFromSquareInvoice(invoice, booking);

  const notify = await sendRefundNotificationEmails({
    amountCents: booking?.amountCents ?? invoiceRefundAmountCents(invoice),
    customerName: booking?.customerName,
    customerEmail: booking?.customerEmail,
    customerPhone: booking?.customerPhone,
    serviceLabel: booking?.serviceLabel,
    serviceDate: booking?.serviceDate,
    appointmentTime: booking?.appointmentTime,
    reason: 'Square invoice refund',
    refundId: invoice.id,
    paymentId: invoice.order_id || '',
  });

  if (notify.sent === true || notify.smsSent === true) {
    await markRefundNotificationSent(supabase, dedupeKey);
  } else if (!notify.skipped) {
    console.error('[square-webhook] invoice refund notification not sent', {
      invoiceId: invoice.id,
      customerEmail: booking?.customerEmail || null,
      notify,
    });
  }

  await supabase
    .from('invoices')
    .update({ status: 'REFUNDED', updated_at: new Date().toISOString() })
    .eq('square_invoice_id', invoice.id);

  return {
    ok: true,
    eventType,
    invoiceId: invoice.id,
    emailSent: notify.sent === true,
    customerCc: notify.customerCc === true,
    smsSent: notify.smsSent === true,
    customerEmailUsed: booking?.customerEmail || null,
  };
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const signatureKey = env('SQUARE_WEBHOOK_SIGNATURE_KEY');
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-square-hmacsha256-signature') || '';

  if (!signatureKey) {
    console.error('[square-webhook] missing SQUARE_WEBHOOK_SIGNATURE_KEY');
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), { status: 503 });
  }

  const configuredUrl = env('SQUARE_WEBHOOK_NOTIFICATION_URL');
  if (
    !isValidSquareWebhookSignature({
      request,
      configuredNotificationUrl: configuredUrl,
      signatureHeader,
      rawBody,
      signatureKey,
    })
  ) {
    console.warn('[square-webhook] invalid signature', {
      configuredUrl: configuredUrl || '(not set)',
      host: request.headers.get('host'),
    });
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 403 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const eventType = String(payload?.type || '');
  const squareEventId = String(payload?.event_id || '').trim();
  console.log('[square-webhook] received', eventType, squareEventId || '');

  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Database not configured' }), { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (squareEventId) {
    const audit = await markWebhookProcessed(supabase, squareEventId, eventType || 'unknown');
    if (audit.duplicate) {
      return new Response(JSON.stringify({ ok: true, duplicate: true, eventType }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  let result;
  if (eventType.startsWith('refund.')) {
    result = await handlePaymentRefund(supabase, payload, eventType);
  } else if (eventType === 'invoice.payment_made') {
    result = await handleInvoicePaymentMade(supabase, payload);
  } else if (eventType === 'invoice.refunded') {
    result = await handleInvoiceRefunded(supabase, payload, eventType);
  } else {
    result = { ok: true, ignored: true, eventType };
  }

  if (result.emailSent === false && result.smsSent === false && !result.ignored && !result.duplicate) {
    console.error('[square-webhook] owner notification not sent', result);
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
