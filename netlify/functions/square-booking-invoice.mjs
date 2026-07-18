/**
 * Create a Square invoice: 50% deposit now + balance due on appointment date.
 * Env: SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: SQUARE_ENVIRONMENT=sandbox|production, SQUARE_DEPOSIT_PERCENT=50
 */
import { createClient } from '@supabase/supabase-js';
import { vegasTodayYmd } from './lib/vegas-dates.mjs';
import {
  createAndPublishDepositInvoice,
  createServiceOrder,
  findOrCreateCustomer,
  parseServicePriceCents,
} from './lib/square-api.mjs';
import { invoicePayloadFromBooking, saveInvoiceRecord } from './lib/invoice-store.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Dynamic key — keeps esbuild from inlining secret env vars into the function bundle. */
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
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'missing_env' }), {
      status: 200,
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
  if (!bookingId || !/^[0-9a-f-]{36}$/i.test(bookingId)) {
    return new Response(JSON.stringify({ error: 'Invalid bookingId' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error: qerr } = await supabase
    .from('bookings')
    .select('id, name, phone, service, date, time, email')
    .eq('id', bookingId)
    .maybeSingle();

  if (qerr || !row) {
    return new Response(JSON.stringify({ error: 'Booking not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const amountCents = parseServicePriceCents(row.service);
  if (!amountCents) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Could not determine service price for invoice' }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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

    const orderId = await createServiceOrder({
      bookingId,
      locationId,
      serviceLabel: row.service,
      amountCents,
      appointmentDate: appointmentLabel,
      accessToken,
      environment,
    });

    const invoice = await createAndPublishDepositInvoice({
      bookingId,
      locationId,
      customerId,
      orderId,
      depositPercent,
      depositDueDate,
      balanceDueDate,
      serviceDate: appointmentDate,
      accessToken,
      environment,
    });

    const depositCents = Math.round((amountCents * Number(invoice.depositPercent)) / 100);
    const balanceCents = amountCents - depositCents;

    const invoiceSave = await saveInvoiceRecord(
      supabase,
      invoicePayloadFromBooking(row, {
        recordType: 'square_invoice',
        invoiceType: 'full',
        squareInvoiceId: invoice.invoiceId,
        squareOrderId: invoice.orderId,
        squareCustomerId: customerId,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        description: invoice.description,
        lineItemName: String(row.service || 'Makeup service').slice(0, 512),
        subtotalCents: amountCents,
        taxCents: 0,
        totalCents: amountCents,
        totalServiceCents: amountCents,
        depositCents,
        balanceCents,
        dueDate: invoice.balanceDueDate,
        publicUrl: invoice.publicUrl,
        squareEnvironment: environment || 'production',
      })
    );

    if (!invoiceSave.ok) {
      console.warn('[square-booking-invoice] invoice record save failed', invoiceSave.error);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        invoiceId: invoice.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        publicUrl: invoice.publicUrl,
        invoiceRecordId: invoiceSave.id || null,
        depositPercent: invoice.depositPercent,
        depositDueDate: invoice.depositDueDate,
        balanceDueDate: invoice.balanceDueDate,
        totalCents: amountCents,
        depositCents: Math.round((amountCents * Number(invoice.depositPercent)) / 100),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[square-booking-invoice]', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Square invoice failed' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
