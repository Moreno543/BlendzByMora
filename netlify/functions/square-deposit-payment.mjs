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
    .select('id, name, phone, service, date, time, email')
    .eq('id', bookingId)
    .maybeSingle();

  if (qerr || !row) {
    return new Response(JSON.stringify({ error: 'Booking not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const totalCents = parseServicePriceCents(row.service);
  if (!totalCents) {
    return new Response(JSON.stringify({ ok: false, error: 'Could not determine service price' }), {
      status: 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const pct = Math.min(99, Math.max(1, depositPercent));
  const depositCents = Math.round((totalCents * pct) / 100);
  const balanceCents = totalCents - depositCents;
  if (depositCents < 1) {
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
      amountCents: depositCents,
      customerId,
      serviceLabel: row.service,
      accessToken,
      environment,
    });

    let balanceInvoice = null;
    if (balanceCents > 0) {
      const orderId = await createBalanceOrder({
        bookingId,
        locationId,
        serviceLabel: row.service,
        balanceCents,
        appointmentDate: appointmentLabel,
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
        accessToken,
        environment,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        paymentId: payment.id,
        depositCents,
        balanceCents,
        balanceInvoiceId: balanceInvoice?.invoiceId || null,
        balanceDueDate: balanceInvoice?.balanceDueDate || balanceDueDate,
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
