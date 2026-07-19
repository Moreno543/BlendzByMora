# Square deposits & balance invoices

When a client books on **blendzbymora.com**:

1. They submit the booking form
2. A **secure Square payment step** appears on the page for the **50% deposit** — **card** (includes processing fee) or **bank transfer (ACH, no card fee)**
3. After the deposit is paid, Square emails an **invoice for the remaining balance** due on the **appointment date** (card or bank transfer accepted on the invoice)

Card and bank details are handled by Square (not stored on your site). You never touch raw card or bank account numbers.

---

## What you need

- A **Square** seller account ([squareup.com](https://squareup.com))
- **Square Invoices** enabled
- A **Square Developer** application

---

## Step 1 — Developer credentials

1. Go to [developer.squareup.com/apps](https://developer.squareup.com/apps)
2. Open your app → **Credentials** (Production for live site)
3. Copy:

| Credential | Where | Goes in |
|------------|--------|---------|
| **Application ID** | Credentials → Application ID (`sq0idp-…`) | `config.js` |
| **Access token** | Credentials → Access token | Netlify env |
| **Location ID** | Square Dashboard → **Locations** | `config.js` + Netlify env |

---

## Step 2 — `config.js` (public, for the card form)

In **`config.js`**, set:

```javascript
SQUARE_APPLICATION_ID: 'sq0idp-XXXXXXXX', // Production Application ID
SQUARE_LOCATION_ID: 'LXXXXXXXX',          // Same as Netlify
SQUARE_ENVIRONMENT: 'production',         // or sandbox while testing
SQUARE_DEPOSIT_PERCENT: 50,
```

These are safe in `config.js` — they are public client IDs (like a Stripe publishable key).

---

## Step 3 — Netlify environment variables

| Variable | Required | Mark as secret? |
|----------|----------|-----------------|
| **`SQUARE_ACCESS_TOKEN`** | Yes | No (uncheck secret; uncheck **Builds** scope) |
| **`SQUARE_LOCATION_ID`** | Yes | No |
| **`SQUARE_ENVIRONMENT`** | Yes | **No** — value `production` appears in code |
| **`SQUARE_DEPOSIT_PERCENT`** | No | **No** |
| **`SQUARE_WEBHOOK_SIGNATURE_KEY`** | For refund emails | Yes |
| **`SQUARE_WEBHOOK_NOTIFICATION_URL`** | For refund emails | No — must match Square exactly |

Also required: **`SUPABASE_URL`**, **`SUPABASE_SERVICE_ROLE_KEY`**, **`FORMSPREE_BOOKING_ID`** (same form as booking — owner inbox + client CC on refund emails)

Run **`sql/invoices.sql`** in Supabase to store Square balance invoices and deposit payments linked to bookings.

If your `invoices` table already exists with `*_cents` integer columns, run **`sql/invoices_dollars_migration.sql`** once instead — it converts stored values to dollars (e.g. `5000` → `50.00`) and renames columns to `subtotal`, `tax`, `total`, `total_service`, `deposit`, and `balance`.

Run **`sql/webhook_events.sql`** in Supabase so refund notification emails are not sent twice.

Run **`sql/bookings_deposit_paid_at.sql`** in Supabase so a date is **only held after the deposit is paid**. Submitting the form without paying no longer blocks that time slot.

After saving, **deploy** the site.

---

## Step 5 — Square webhooks (refunds + invoice paid alerts)

### Refunds
When you issue a **refund in Square**, the client and you both receive a **Formspree email** (client is CC’d).

### Balance invoice paid
When a client **pays their remaining balance invoice** (or pays a full Square invoice), you get:
- **Email** to your Formspree inbox (**BlendzByMora@gmail.com**)
- **SMS** to **`TWILIO_OWNER_NOTIFY_PHONE`** if Twilio is configured (same as YES-reply alerts)

1. [developer.squareup.com/apps](https://developer.squareup.com/apps) → your app → **Webhooks** → your subscription (or **Add subscription**)
2. **Notification URL** (use your live domain exactly):

   `https://blendzbymora.com/.netlify/functions/square-webhook`

   If your site uses `www`, use:

   `https://www.blendzbymora.com/.netlify/functions/square-webhook`

3. Subscribe to events:
   - **`refund.created`**, **`refund.updated`**, **`invoice.refunded`**
   - **`invoice.payment_made`** — notifies you when a client pays their balance invoice in full
4. Copy the subscription **Signature key**
5. In **Netlify → Environment variables**, add:
   - **`SQUARE_WEBHOOK_SIGNATURE_KEY`** = signature key (mark as secret)
   - **`SQUARE_WEBHOOK_NOTIFICATION_URL`** = the **exact same URL** as step 2 (no trailing slash)
6. **Deploy** the site

Square also sends its own refund receipt to the customer; Formspree adds your branded confirmation on refunds.

---

## Step 4 — Test

1. Submit a test booking on [blendzbymora.com/book.html](https://blendzbymora.com/book.html)
2. After submit, a **card form** should appear with the deposit amount
3. Pay with your card (or [sandbox test card](https://developer.squareup.com/docs/devtools/sandbox/payments))
4. Check **Square Dashboard → Payments** for the deposit
5. Check **Invoices** for the balance due on the appointment date

---

## How pricing works

Service price is parsed from the dropdown (e.g. `Soft Glam - $100` → **$50** deposit + **$50** balance).

**Card processing fee:** Each Square **card** payment (deposit and balance invoice) adds **3.3% + $0.30** to the amount charged so processing costs are covered. If the client pays both by card, the fee applies **twice**. **Bank transfer (ACH)**, cash, and Zelle are not subject to this fee. ACH deposits may show as **PENDING** for 2–3 business days before they complete.

**ACH (bank transfer):** Enable ACH in your Square account if the bank transfer tab does not appear. The booking page uses Square’s Web Payments SDK ACH flow (Plaid). Balance invoices accept **bank_account** payments as well as card.

---

## Card statement name (Amex / Visa / etc.)

What customers see on their card activity (e.g. **BlendzByMora Service**) comes from **Square**, not your website.

**1. Square Dashboard (required)** — set your public business name:

1. Go to [squareup.com/dashboard](https://squareup.com/dashboard)
2. **Account & Settings** → **Business** → **Business information**
3. Set **Business name** to **`BlendzByMora`** (or **`BlendzByMora Service`** if it fits)
4. Save

**2. Website (already configured)** — deposit payments send `statement_description_identifier: BlendzByMora Service` so Square can include it on the statement (format is typically `SQ *` + business name + descriptor; banks may shorten it).

**Note:** **Pending** charges on Amex often show a generic label like “SERVICE TRANSACTION” until the payment **posts** (1–3 days). After posting, the Square business name usually appears. Old payments won’t change — only **new** deposits after deploy.

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| No card form after booking | `SQUARE_APPLICATION_ID` and `SQUARE_LOCATION_ID` set in `config.js`? Redeploy |
| Bank transfer unavailable | ACH enabled on your Square account? Try Production (not all sandbox sellers have ACH) |
| “Card payment unavailable” | Application ID matches Production/Sandbox with `SQUARE_ENVIRONMENT` |
| Payment failed | Netlify function logs → `square-deposit-payment`; access token + location ID |
| No balance invoice email | Square Inboxes / spam; Invoices enabled on account |
| No refund emails | Square → Webhooks → **Logs** (403 = bad signature key or URL mismatch). Run **`sql/webhook_events.sql`**. Set **`FORMSPREE_BOOKING_ID`** on Netlify (Functions scope). |
| No alert when client pays balance invoice | Add **`invoice.payment_made`** to Square webhook events. Redeploy. Set **`TWILIO_OWNER_NOTIFY_PHONE`** for SMS. |
| Amex still says “SERVICE TRANSACTION” | **Pending** charges use a generic label until they post (1–3 days). Set Square **Business name** to BlendzByMora; only **new** payments use the updated descriptor. |

---

## Files

- `netlify/functions/square-deposit-payment.mjs` — charges deposit, emails balance invoice
- `netlify/functions/square-webhook.mjs` — refund emails to owner + client
- `netlify/functions/lib/square-api.mjs` — Square API helpers
- `app.js` — Square Web Payments card form after booking
- `config.js` — Application ID + Location ID for the card form
