/**
 * Charge 50% deposit via Square Web Payments token, then email balance invoice.
 * Env: SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: SQUARE_ENVIRONMENT, SQUARE_DEPOSIT_PERCENT
 */
import { createClient } from '@supabase/supabase-js';
import { vegasTodayYmd } from './lib/vegas-dates.mjs';
import {
  createAndPublishBalanceInvoice,
  createBalanceOrder,
  createSquarePayment,
  findOrCreateCustomer,
  parseServicePriceCents,
} from './lib/square-api.mjs';
import { notifyBookingConfirmedAfterDeposit } from './lib/booking-notify.mjs';
import { invoicePayloadFromBooking, saveInvoiceRecord } from './lib/invoice-store.mjs';
import {
  cardChargeTotalCents,
  cardProcessingFeeCents,
  cardProcessingFeeLabel,
} from './lib/card-processing-fee.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function env(name) {
  return String(process.env[name] ?? '').trim();
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const accessToken = env('SQUARE_ACCESS_TOKEN');
  const locationId = env('SQUARE_LOCATION_ID');
  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const environment = env('SQUARE_ENVIRONMENT');
  const depositPercent = Number(env('SQUARE_DEPOSIT_PERCENT') || 50);

  if (!accessToken || !locationId || !supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ ok: false, error: 'Payment not configured' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    body = {};
  }

  const bookingId = typeof body?.bookingId === 'string' ? body.bookingId.trim() : '';
  const sourceId = typeof body?.sourceId === 'string' ? body.sourceId.trim() : '';
  const attemptId = typeof body?.attemptId === 'string' ? body.attemptId.trim() : '';
  const paymentMethod = body?.paymentMethod === 'ach' ? 'ach' : 'card';
  const isAch = paymentMethod === 'ach';
  if (!bookingId || !/^[0-9a-f-]{36}$/i.test(bookingId)) {
    return new Response(JSON.stringify({ error: 'Invalid bookingId' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!sourceId) {
    return new Response(JSON.stringify({ error: 'Invalid payment token' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!attemptId || !/^[0-9a-f-]{36}$/i.test(attemptId)) {
    return new Response(JSON.stringify({ error: 'Invalid payment attemptId' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error: qerr } = await supabase
    .from('bookings')
    .select('id, name, phone, service, date, time, email, travel, notes, sms_consent, deposit_paid_at')
    .eq('id', bookingId)
    .maybeSingle();

  if (qerr || !row) {
    return new Response(JSON.stringify({ error: 'Booking not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (row.deposit_paid_at) {
    return new Response(JSON.stringify({ ok: true, alreadyPaid: true, bookingId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: slotTaken } = await supabase
    .from('bookings')
    .select('id')
    .eq('date', row.date)
    .eq('time', row.time)
    .not('deposit_paid_at', 'is', null)
    .neq('id', bookingId)
    .maybeSingle();

  if (slotTaken?.id) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'That time was just booked by someone else. Please go back and choose another slot.',
      }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const totalCents = parseServicePriceCents(row.service);
  if (!totalCents) {
    return new Response(JSON.stringify({ ok: false, error: 'Could not determine service price' }), {
      status: 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const pct = Math.min(99, Math.max(1, depositPercent));
  const depositBaseCents = Math.round((totalCents * pct) / 100);
  const balanceBaseCents = totalCents - depositBaseCents;
  const depositFeeCents = cardProcessingFeeCents(depositBaseCents);
  const depositCardChargeCents = cardChargeTotalCents(depositBaseCents);
  const balanceFeeCents = cardProcessingFeeCents(balanceBaseCents);
  const balanceCardChargeCents = cardChargeTotalCents(balanceBaseCents);
  const depositChargeCents = isAch ? depositBaseCents : depositCardChargeCents;
  const balanceChargeCents = isAch ? balanceBaseCents : balanceCardChargeCents;
  const feeLabel = cardProcessingFeeLabel();
  if (depositBaseCents < 1) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid deposit amount' }), {
      status: 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const appointmentDate = String(row.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid appointment date' }), {
      status: 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const depositDueDate = vegasTodayYmd();
  const balanceDueDate = appointmentDate >= depositDueDate ? appointmentDate : depositDueDate;
  const appointmentLabel = `${appointmentDate} ${row.time || ''}`.trim();

  try {
    const customerId = await findOrCreateCustomer({
      email: row.email,
      name: row.name,
      phone: row.phone,
      accessToken,
      environment,
    });

    const payment = await createSquarePayment({
      idempotencySeed: attemptId,
      locationId,
      sourceId,
      amountCents: depositChargeCents,
      customerId,
      bookingId,
      serviceLabel: row.service,
      paymentMethod,
      accessToken,
      environment,
    });

    let balanceInvoice = null;
    if (balanceBaseCents > 0) {
      const orderId = await createBalanceOrder({
        bookingId,
        locationId,
        serviceLabel: row.service,
        balanceCents: balanceChargeCents,
        appointmentDate: appointmentLabel,
        processingFeeLabel: feeLabel,
        paymentMethod,
        accessToken,
        environment,
      });

      balanceInvoice = await createAndPublishBalanceInvoice({
        bookingId,
        locationId,
        customerId,
        orderId,
        balanceDueDate,
        serviceDate: appointmentDate,
        serviceLabel: row.service,
        balanceCents: balanceChargeCents,
        balanceBaseCents,
        appointmentLabel,
        processingFeeLabel: feeLabel,
        paymentMethod,
        accessToken,
        environment,
      });
    }

    const depositSave = await saveInvoiceRecord(
      supabase,
      invoicePayloadFromBooking(row, {
        recordType: 'deposit_payment',
        invoiceType: 'deposit',
        squarePaymentId: payment.id,
        squareCustomerId: customerId,
        status: payment.status || 'COMPLETED',
        description: isAch
          ? `Blendz By Mora deposit (bank transfer) — ${String(row.service || 'appointment').slice(0, 360)}`
          : `Blendz By Mora deposit — ${String(row.service || 'appointment').slice(0, 360)} ` +
            `(includes ${feeLabel} card processing fee)`,
        lineItemName: String(row.service || 'Makeup service').slice(0, 512),
        subtotalCents: depositBaseCents,
        taxCents: isAch ? 0 : depositFeeCents,
        totalCents: depositChargeCents,
        totalServiceCents: totalCents,
        depositCents: depositBaseCents,
        balanceCents: balanceBaseCents > 0 ? balanceBaseCents : null,
        dueDate: depositDueDate,
        squareEnvironment: environment || 'production',
      })
    );

    if (!depositSave.ok) {
      console.warn('[square-deposit-payment] deposit record save failed', depositSave.error);
    }

    let balanceInvoiceSave = null;
    if (balanceInvoice) {
      balanceInvoiceSave = await saveInvoiceRecord(
        supabase,
        invoicePayloadFromBooking(row, {
          recordType: 'square_invoice',
          invoiceType: 'balance',
          squareInvoiceId: balanceInvoice.invoiceId,
          squareOrderId: balanceInvoice.orderId,
          squareCustomerId: customerId,
          invoiceNumber: balanceInvoice.invoiceNumber,
          status: balanceInvoice.status,
          description: balanceInvoice.description,
          lineItemName: balanceInvoice.lineItemName,
          lineItemNote: balanceInvoice.lineItemNote,
          subtotalCents: balanceInvoice.subtotalCents ?? balanceBaseCents,
          taxCents: balanceInvoice.taxCents ?? (isAch ? 0 : balanceFeeCents),
          totalCents: balanceInvoice.totalCents ?? balanceChargeCents,
          totalServiceCents: totalCents,
          depositCents: depositBaseCents,
          balanceCents: balanceBaseCents,
          dueDate: balanceInvoice.balanceDueDate,
          publicUrl: balanceInvoice.publicUrl,
          squareEnvironment: environment || 'production',
        })
      );
      if (!balanceInvoiceSave.ok) {
        console.warn('[square-deposit-payment] balance invoice save failed', balanceInvoiceSave.error);
      }
    }

    const achPending = isAch && String(payment.status || '').toUpperCase() === 'PENDING';
    const notify = await notifyBookingConfirmedAfterDeposit(row, { paymentMethod, achPending });

    const paidAt = new Date().toISOString();
    const { error: paidErr } = await supabase
      .from('bookings')
      .update({ deposit_paid_at: paidAt })
      .eq('id', bookingId)
      .is('deposit_paid_at', null);
    if (paidErr) {
      console.warn('[square-deposit-payment] deposit_paid_at update failed', paidErr);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        paymentId: payment.id,
        paymentMethod,
        paymentStatus: payment.status || null,
        achPending,
        depositBaseCents,
        depositChargeCents,
        depositFeeCents: isAch ? 0 : depositFeeCents,
        balanceBaseCents,
        balanceChargeCents,
        balanceFeeCents: isAch ? 0 : balanceFeeCents,
        balanceInvoiceId: balanceInvoice?.invoiceId || null,
        balanceInvoiceNumber: balanceInvoice?.invoiceNumber || null,
        balanceDueDate: balanceInvoice?.balanceDueDate || balanceDueDate,
        invoiceRecordId: balanceInvoiceSave?.id || null,
        depositRecordId: depositSave.id || null,
        emailSent: notify.email?.sent === true,
        smsSent: notify.sms?.sent === true,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[square-deposit-payment]', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Payment failed' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
