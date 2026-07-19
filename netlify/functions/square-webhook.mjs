/**
 * Square webhooks — send refund confirmation email to owner + customer (Formspree CC).
 *
 * Square Developer Console → Webhooks → Add subscription:
 *   URL: https://blendzbymora.com/.netlify/functions/square-webhook
 *   Events: refund.created, refund.updated
 *
 * Env:
 *   SQUARE_WEBHOOK_SIGNATURE_KEY — subscription signature key
 *   SQUARE_WEBHOOK_NOTIFICATION_URL — exact URL in Square (recommended)
 *   FORMSPREE_BOOKING_ID — owner inbox + customer CC
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — booking lookup + dedupe
 */
import { createClient } from '@supabase/supabase-js';
import { isValidSquareWebhookSignature } from './lib/square-webhook-verify.mjs';
import { sendRefundNotificationEmails } from './lib/refund-notify.mjs';

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

async function markEventProcessed(supabase, eventId, eventType) {
  const { error } = await supabase.from('webhook_events').insert({
    event_id: eventId,
    event_type: eventType,
  });
  if (error?.code === '23505') return false;
  if (error) {
    console.error('[square-webhook] dedupe insert failed', error);
    return false;
  }
  return true;
}

async function lookupBookingForPayment(supabase, paymentId) {
  if (!paymentId) return null;

  const { data: invoiceRow } = await supabase
    .from('invoices')
    .select(
      'booking_id, customer_name, customer_email, customer_phone, service_label, service_date, appointment_time'
    )
    .eq('square_payment_id', paymentId)
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
    };
  }

  if (!invoiceRow?.booking_id) return null;

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

  if (
    !isValidSquareWebhookSignature({
      request,
      configuredNotificationUrl: env('SQUARE_WEBHOOK_NOTIFICATION_URL'),
      signatureHeader,
      rawBody,
      signatureKey,
    })
  ) {
    console.warn('[square-webhook] invalid signature');
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 403 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const eventType = String(payload?.type || '');
  if (!eventType.startsWith('refund.')) {
    return new Response(JSON.stringify({ ok: true, ignored: true, eventType }), { status: 200 });
  }

  const refund = extractRefund(payload);
  if (!refund?.id) {
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'no_refund' }), {
      status: 200,
    });
  }

  const status = String(refund.status || '').toUpperCase();
  if (status !== 'COMPLETED' && status !== 'APPROVED') {
    return new Response(JSON.stringify({ ok: true, ignored: true, status }), { status: 200 });
  }

  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Database not configured' }), { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const dedupeKey = `refund:${refund.id}`;
  const isNew = await markEventProcessed(supabase, dedupeKey, eventType);
  if (!isNew) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });
  }

  const paymentId = String(refund.payment_id || '').trim();
  const booking = await lookupBookingForPayment(supabase, paymentId);

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
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
