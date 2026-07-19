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

function refundShouldNotify(refund) {
  const status = String(refund?.status || '').toUpperCase();
  if (!status) return false;
  if (status === 'FAILED' || status === 'REJECTED' || status === 'CANCELED') return false;
  return true;
}

/** @returns {{ duplicate: boolean, dedupeSkipped?: boolean }} */
async function markRefundNotified(supabase, refundId, eventType) {
  const eventId = `refund:${refundId}`;
  const { error } = await supabase.from('webhook_events').insert({
    event_id: eventId,
    event_type: eventType,
  });
  if (error?.code === '23505') return { duplicate: true };
  if (error) {
    console.warn('[square-webhook] dedupe table unavailable, sending anyway:', error.message);
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

    return {
      customerName: existing?.customerName || 'Client',
      customerEmail: existing?.customerEmail || buyerEmail || null,
      customerPhone: existing?.customerPhone || null,
      serviceLabel: existing?.serviceLabel || note.replace(/^Blendz By Mora deposit — /, '') || 'Makeup appointment',
      serviceDate: existing?.serviceDate || null,
      appointmentTime: existing?.appointmentTime || null,
      bookingId: existing?.bookingId || null,
    };
  } catch (err) {
    console.warn('[square-webhook] Square payment lookup failed', err);
    return existing;
  }
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
  console.log('[square-webhook] received', eventType, payload?.event_id || '');

  if (!eventType.startsWith('refund.')) {
    return new Response(JSON.stringify({ ok: true, ignored: true, eventType }), { status: 200 });
  }

  const refund = extractRefund(payload);
  if (!refund?.id) {
    console.warn('[square-webhook] no refund in payload', eventType);
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'no_refund' }), {
      status: 200,
    });
  }

  if (!refundShouldNotify(refund)) {
    return new Response(
      JSON.stringify({ ok: true, ignored: true, status: refund.status || 'unknown' }),
      { status: 200 }
    );
  }

  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Database not configured' }), { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const dedupe = await markRefundNotified(supabase, refund.id, eventType);
  if (dedupe.duplicate) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });
  }

  const paymentId = String(refund.payment_id || '').trim();
  let booking = await lookupBookingForPayment(supabase, paymentId);
  booking = await enrichFromSquarePayment(paymentId, booking);

  const amountCents = refund.amount_money?.amount ?? refund.amount?.amount ?? null;

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
  });

  if (!notify.sent && !notify.skipped) {
    console.error('[square-webhook] email failed', notify);
  }

  if (paymentId) {
    await supabase
      .from('invoices')
      .update({ status: 'REFUNDED', updated_at: new Date().toISOString() })
      .eq('square_payment_id', paymentId);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      eventType,
      refundId: refund.id,
      emailSent: notify.sent === true,
      customerCc: notify.customerCc === true,
      customerEmailUsed: booking?.customerEmail || null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
