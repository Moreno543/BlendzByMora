/**
 * Square webhooks — send refund confirmation email to owner + customer (Formspree CC).
 */
import { createClient } from '@supabase/supabase-js';
import { isValidSquareWebhookSignature } from './lib/square-webhook-verify.mjs';
import { sendRefundNotificationEmails } from './lib/refund-notify.mjs';
import { getSquarePayment } from './lib/square-api.mjs';

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
  return true;
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
      'booking_id, customer_name, customer_email, customer_phone, service_label, service_date, appointment_time'
    )
    .eq('square_payment_id', paymentId)
    .maybeSingle();

  if (invoiceErr) {
    console.warn('[square-webhook] invoice lookup failed', invoiceErr.message);
  }

  if (invoiceRow?.customer_email) {
    return {
      customerName: invoiceRow.customer_name,
      customerEmail: invoiceRow.customer_email,
      customerPhone: invoiceRow.customer_phone,
      serviceLabel: invoiceRow.service_label,
      serviceDate: invoiceRow.service_date,
      appointmentTime: invoiceRow.appointment_time,
      bookingId: invoiceRow.booking_id,
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
      'booking_id, customer_name, customer_email, customer_phone, service_label, service_date, appointment_time, total_cents'
    )
    .eq('square_invoice_id', squareInvoiceId)
    .maybeSingle();

  if (invoiceRow?.customer_email) {
    return {
      customerName: invoiceRow.customer_name,
      customerEmail: invoiceRow.customer_email,
      customerPhone: invoiceRow.customer_phone,
      serviceLabel: invoiceRow.service_label,
      serviceDate: invoiceRow.service_date,
      appointmentTime: invoiceRow.appointment_time,
      bookingId: invoiceRow.booking_id,
      amountCents: invoiceRow.total_cents,
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
        amountCents: invoiceRow.total_cents,
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
    customerCc: notify.customerSent === true,
    customerEmailUsed: booking?.customerEmail || null,
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

  await supabase
    .from('invoices')
    .update({ status: 'REFUNDED', updated_at: new Date().toISOString() })
    .eq('square_invoice_id', invoice.id);

  return {
    ok: true,
    eventType,
    invoiceId: invoice.id,
    emailSent: notify.sent === true,
    customerCc: notify.customerSent === true,
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
  } else if (eventType === 'invoice.refunded') {
    result = await handleInvoiceRefunded(supabase, payload, eventType);
  } else {
    result = { ok: true, ignored: true, eventType };
  }

  if (result.emailSent === false && !result.ignored && !result.duplicate) {
    console.error('[square-webhook] email not sent', result);
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
