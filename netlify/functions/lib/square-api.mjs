/** Square Invoices API helpers (server-side only). */

const DEFAULT_SQUARE_VERSION = '2024-10-17';
const MAX_IDEMPOTENCY_KEY_LEN = 45;

/** Square idempotency keys must be ≤ 45 characters. */
export function squareIdempotencyKey(prefix, unique) {
  const raw = `${prefix}${unique}`;
  return raw.length <= MAX_IDEMPOTENCY_KEY_LEN ? raw : raw.slice(0, MAX_IDEMPOTENCY_KEY_LEN);
}

export function squareBaseUrl(environment) {
  const env = String(environment || 'production').toLowerCase();
  return env === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';
}

export function parseServicePriceCents(serviceLabel) {
  const s = String(serviceLabel || '');
  const matches = [...s.matchAll(/\$(\d+(?:\.\d{2})?)/g)];
  if (!matches.length) return null;
  const dollars = parseFloat(matches[matches.length - 1][1]);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

export async function squareFetch({ path, method = 'GET', body, accessToken, environment, squareVersion }) {
  const url = `${squareBaseUrl(environment)}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Square-Version': squareVersion || DEFAULT_SQUARE_VERSION,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.errors?.[0]?.detail || json?.errors?.[0]?.code || res.statusText;
    throw new Error(`Square ${method} ${path}: ${detail}`);
  }
  return json;
}

/** Fetch payment details (buyer email, receipt, note) for refund notifications. */
export async function getSquarePayment({ paymentId, accessToken, environment, squareVersion }) {
  if (!paymentId) return null;
  const json = await squareFetch({
    path: `/v2/payments/${encodeURIComponent(paymentId)}`,
    accessToken,
    environment,
    squareVersion,
  });
  return json?.payment || null;
}

/** Fetch Square customer profile (email, name, phone) for refund notifications. */
export async function getSquareCustomer({ customerId, accessToken, environment, squareVersion }) {
  if (!customerId) return null;
  const json = await squareFetch({
    path: `/v2/customers/${encodeURIComponent(customerId)}`,
    accessToken,
    environment,
    squareVersion,
  });
  return json?.customer || null;
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { given_name: 'Client', family_name: undefined };
  if (parts.length === 1) return { given_name: parts[0], family_name: undefined };
  return { given_name: parts[0], family_name: parts.slice(1).join(' ') };
}

function normalizePhoneE164(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return undefined;
}

export async function findOrCreateCustomer({ email, name, phone, accessToken, environment, squareVersion }) {
  const emailNorm = String(email || '').trim().toLowerCase();
  if (!emailNorm) throw new Error('Customer email required for Square invoice');

  const search = await squareFetch({
    path: '/v2/customers/search',
    method: 'POST',
    body: {
      query: {
        filter: {
          email_address: { exact: emailNorm },
        },
      },
    },
    accessToken,
    environment,
    squareVersion,
  });

  const existing = search?.customers?.[0];
  if (existing?.id) return existing.id;

  const { given_name, family_name } = splitName(name);
  const create = await squareFetch({
    path: '/v2/customers',
    method: 'POST',
    body: {
      idempotency_key: squareIdempotencyKey('cust-', emailNorm),
      given_name,
      ...(family_name ? { family_name } : {}),
      email_address: emailNorm,
      ...(normalizePhoneE164(phone) ? { phone_number: normalizePhoneE164(phone) } : {}),
    },
    accessToken,
    environment,
    squareVersion,
  });

  const id = create?.customer?.id;
  if (!id) throw new Error('Square customer create failed');
  return id;
}

export async function createServiceOrder({
  bookingId,
  locationId,
  serviceLabel,
  amountCents,
  appointmentDate,
  accessToken,
  environment,
  squareVersion,
}) {
  const note =
    `Appointment: ${appointmentDate || 'TBD'}. ` +
    '50% deposit due now; remaining balance due on your service date.';
  const create = await squareFetch({
    path: '/v2/orders',
    method: 'POST',
    body: {
      idempotency_key: squareIdempotencyKey('ord-', bookingId),
      order: {
        location_id: locationId,
        line_items: [
          {
            name: String(serviceLabel || 'Makeup service').slice(0, 512),
            quantity: '1',
            note,
            base_price_money: { amount: amountCents, currency: 'USD' },
          },
        ],
      },
    },
    accessToken,
    environment,
    squareVersion,
  });

  const orderId = create?.order?.id;
  if (!orderId) throw new Error('Square order create failed');
  return orderId;
}

export async function createSquarePayment({
  idempotencySeed,
  locationId,
  sourceId,
  amountCents,
  customerId,
  bookingId,
  serviceLabel,
  paymentMethod = 'card',
  accessToken,
  environment,
  squareVersion,
}) {
  const isAch = paymentMethod === 'ach';
  const referenceId = String(bookingId || '').trim().slice(0, 40) || undefined;
  const create = await squareFetch({
    path: '/v2/payments',
    method: 'POST',
    body: {
      idempotency_key: squareIdempotencyKey(isAch ? 'ach-' : 'dep-', idempotencySeed),
      source_id: sourceId,
      amount_money: { amount: amountCents, currency: 'USD' },
      location_id: locationId,
      autocomplete: true,
      ...(referenceId ? { reference_id: referenceId } : {}),
      ...(customerId ? { customer_id: customerId } : {}),
      ...(isAch
        ? {}
        : { statement_description_identifier: 'BlendzByMora Service'.slice(0, 20) }),
      note: isAch
        ? `Blendz By Mora deposit (bank transfer) — ${String(serviceLabel || 'appointment').slice(0, 360)}`
        : `Blendz By Mora deposit — ${String(serviceLabel || 'appointment').slice(0, 400)}`,
    },
    accessToken,
    environment,
    squareVersion,
  });
  const payment = create?.payment;
  if (!payment?.id) throw new Error('Square payment failed');
  return payment;
}

export async function createBalanceOrder({
  bookingId,
  locationId,
  serviceLabel,
  balanceCents,
  appointmentDate,
  processingFeeLabel,
  paymentMethod = 'card',
  accessToken,
  environment,
  squareVersion,
}) {
  const isAch = paymentMethod === 'ach';
  const feeNote =
    !isAch && processingFeeLabel ? ` Includes ${processingFeeLabel} card processing fee.` : '';
  const achNote = isAch ? ' Pay by bank transfer (ACH) — no card processing fee.' : '';
  const note =
    `Remaining balance for appointment ${appointmentDate || 'TBD'}. ` +
    'Your deposit was paid online when you booked.' +
    feeNote +
    achNote;
  const create = await squareFetch({
    path: '/v2/orders',
    method: 'POST',
    body: {
      idempotency_key: squareIdempotencyKey('obal-', bookingId),
      order: {
        location_id: locationId,
        line_items: [
          {
            name: `${String(serviceLabel || 'Makeup service').slice(0, 480)} — balance`,
            quantity: '1',
            note,
            base_price_money: { amount: balanceCents, currency: 'USD' },
          },
        ],
      },
    },
    accessToken,
    environment,
    squareVersion,
  });
  const orderId = create?.order?.id;
  if (!orderId) throw new Error('Square balance order create failed');
  return orderId;
}

export async function createAndPublishBalanceInvoice({
  bookingId,
  locationId,
  customerId,
  orderId,
  balanceDueDate,
  serviceDate,
  serviceLabel,
  balanceCents,
  balanceBaseCents,
  appointmentLabel,
  processingFeeLabel,
  paymentMethod = 'card',
  accessToken,
  environment,
  squareVersion,
}) {
  const isAch = paymentMethod === 'ach';
  const feeNote =
    !isAch && processingFeeLabel ? ` Includes ${processingFeeLabel} card processing fee.` : '';
  const achNote = isAch ? ' Pay by bank transfer (ACH) — no card processing fee.' : '';
  const lineItemName = `${String(serviceLabel || 'Makeup service').slice(0, 480)} — balance`;
  const lineItemNote =
    `Remaining balance for appointment ${appointmentLabel || serviceDate || 'TBD'}. ` +
    'Your deposit was paid online when you booked.' +
    feeNote +
    achNote;
  const description = isAch
    ? 'Blendz By Mora — remaining balance for your appointment. Bank transfer (ACH) or card accepted on your Square invoice.'
    : 'Blendz By Mora — remaining balance for your appointment (includes card processing fee where applicable). Due on your service date.';

  const create = await squareFetch({
    path: '/v2/invoices',
    method: 'POST',
    body: {
      idempotency_key: squareIdempotencyKey('ibal-', bookingId),
      invoice: {
        location_id: locationId,
        order_id: orderId,
        primary_recipient: { customer_id: customerId },
        delivery_method: 'EMAIL',
        sale_or_service_date: serviceDate,
        payment_requests: [
          {
            request_type: 'BALANCE',
            due_date: balanceDueDate,
          },
        ],
        accepted_payment_methods: {
          card: true,
          square_gift_card: true,
          bank_account: true,
          buy_now_pay_later: false,
          cash_app_pay: true,
        },
        description,
      },
    },
    accessToken,
    environment,
    squareVersion,
  });

  const invoice = create?.invoice;
  if (!invoice?.id) throw new Error('Square balance invoice create failed');

  const published = await squareFetch({
    path: `/v2/invoices/${invoice.id}/publish`,
    method: 'POST',
    body: {
      idempotency_key: squareIdempotencyKey('pbal-', bookingId),
      version: invoice.version,
    },
    accessToken,
    environment,
    squareVersion,
  });

  const out = published?.invoice || invoice;
  const computedBalance = invoicePaymentAmountCents(out, 'BALANCE') ?? balanceCents ?? null;

  return {
    invoiceId: out.id,
    invoiceNumber: out.invoice_number || null,
    status: out.status || null,
    publicUrl: out.public_url || null,
    orderId: out.order_id || orderId,
    balanceDueDate,
    description: out.description || description,
    saleOrServiceDate: out.sale_or_service_date || serviceDate,
    balanceCents: computedBalance,
    subtotalCents: balanceBaseCents ?? computedBalance,
    taxCents:
      balanceBaseCents != null && computedBalance != null ? computedBalance - balanceBaseCents : 0,
    totalCents: computedBalance,
    lineItemName,
    lineItemNote,
    invoice: out,
  };
}

function invoicePaymentAmountCents(invoice, requestType) {
  const requests = invoice?.payment_requests;
  if (!Array.isArray(requests)) return null;
  const match = requests.find((r) => r.request_type === requestType);
  const money = match?.computed_amount_money || match?.requested_amount_money;
  const amount = money?.amount;
  return Number.isFinite(amount) ? amount : null;
}

export async function createAndPublishDepositInvoice({
  bookingId,
  locationId,
  customerId,
  orderId,
  depositPercent,
  depositDueDate,
  balanceDueDate,
  serviceDate,
  accessToken,
  environment,
  squareVersion,
}) {
  const pct = String(Math.min(99, Math.max(1, Number(depositPercent) || 50)));

  const create = await squareFetch({
    path: '/v2/invoices',
    method: 'POST',
    body: {
      idempotency_key: squareIdempotencyKey('inv-', bookingId),
      invoice: {
        location_id: locationId,
        order_id: orderId,
        primary_recipient: { customer_id: customerId },
        delivery_method: 'EMAIL',
        sale_or_service_date: serviceDate,
        payment_requests: [
          {
            request_type: 'DEPOSIT',
            due_date: depositDueDate,
            percentage_requested: pct,
          },
          {
            request_type: 'BALANCE',
            due_date: balanceDueDate,
          },
        ],
        accepted_payment_methods: {
          card: true,
          square_gift_card: true,
          bank_account: true,
          buy_now_pay_later: false,
          cash_app_pay: true,
        },
        description:
          'Blendz By Mora appointment invoice. A 50% deposit secures your booking; the remaining balance is due on your service date.',
      },
    },
    accessToken,
    environment,
    squareVersion,
  });

  const invoice = create?.invoice;
  if (!invoice?.id) throw new Error('Square invoice create failed');

  const published = await squareFetch({
    path: `/v2/invoices/${invoice.id}/publish`,
    method: 'POST',
    body: {
      idempotency_key: squareIdempotencyKey('pub-', bookingId),
      version: invoice.version,
    },
    accessToken,
    environment,
    squareVersion,
  });

  const out = published?.invoice || invoice;
  const depositCents = invoicePaymentAmountCents(out, 'DEPOSIT');
  const balanceCents = invoicePaymentAmountCents(out, 'BALANCE');

  return {
    invoiceId: out.id,
    invoiceNumber: out.invoice_number || null,
    status: out.status || null,
    publicUrl: out.public_url || null,
    orderId: out.order_id || orderId,
    depositDueDate,
    balanceDueDate,
    depositPercent: pct,
    depositCents,
    balanceCents,
    description: out.description || null,
    saleOrServiceDate: out.sale_or_service_date || serviceDate,
    invoice: out,
  };
}
