/**
 * Persist Square invoice / deposit payment rows in Supabase.
 */
import { centsToDollars, optionalCentsToDollars } from './money.mjs';

function str(v) {
  const s = String(v ?? '').trim();
  return s || null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Record<string, unknown>} payload
 */
export async function saveInvoiceRecord(supabase, payload) {
  const row = {
    booking_id: payload.bookingId || null,
    record_type: payload.recordType,
    invoice_type: payload.invoiceType,
    square_invoice_id: str(payload.squareInvoiceId),
    square_payment_id: str(payload.squarePaymentId),
    square_order_id: str(payload.squareOrderId),
    square_customer_id: str(payload.squareCustomerId),
    invoice_number: str(payload.invoiceNumber),
    status: str(payload.status),
    customer_name: str(payload.customerName),
    customer_email: str(payload.customerEmail),
    customer_phone: str(payload.customerPhone),
    service_label: str(payload.serviceLabel),
    service_date: str(payload.serviceDate),
    appointment_time: str(payload.appointmentTime),
    description: str(payload.description),
    line_item_name: str(payload.lineItemName),
    line_item_note: str(payload.lineItemNote),
    subtotal: centsToDollars(payload.subtotalCents),
    tax: centsToDollars(payload.taxCents),
    total: centsToDollars(payload.totalCents),
    total_service: optionalCentsToDollars(payload.totalServiceCents),
    deposit: optionalCentsToDollars(payload.depositCents),
    balance: optionalCentsToDollars(payload.balanceCents),
    due_date: str(payload.dueDate),
    public_url: str(payload.publicUrl),
    square_environment: str(payload.squareEnvironment) || 'production',
  };

  const { data, error } = await supabase.from('invoices').insert(row).select('id').maybeSingle();

  if (error) {
    console.error('[invoice-store] insert failed', error);
    return { ok: false, error: error.message };
  }

  return { ok: true, id: data?.id || null };
}

/** Build a row from a booking record + payment/invoice details. */
export function invoicePayloadFromBooking(booking, extras) {
  return {
    bookingId: booking.id,
    customerName: booking.name,
    customerEmail: booking.email,
    customerPhone: booking.phone,
    serviceLabel: booking.service,
    serviceDate: String(booking.date || '').slice(0, 10) || null,
    appointmentTime: booking.time || null,
    ...extras,
  };
}
