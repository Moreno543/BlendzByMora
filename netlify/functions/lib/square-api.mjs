/** Square Invoices API helpers (server-side only). */

const DEFAULT_SQUARE_VERSION = '2024-10-17';

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
      idempotency_key: `customer-${emailNorm}`,
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
      idempotency_key: `order-${bookingId}`,
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
      idempotency_key: `invoice-${bookingId}`,
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
          bank_account: false,
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
      idempotency_key: `publish-${bookingId}`,
      version: invoice.version,
    },
    accessToken,
    environment,
    squareVersion,
  });

  const out = published?.invoice || invoice;
  return {
    invoiceId: out.id,
    publicUrl: out.public_url || null,
    depositDueDate,
    balanceDueDate,
    depositPercent: pct,
  };
}
