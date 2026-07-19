# Square deposits & balance invoices

When a client books on **blendzbymora.com**:

1. They submit the booking form
2. A **secure Square card form** appears on the page for the **50% deposit**
3. After the deposit is paid, Square emails an **invoice for the remaining balance** due on the **appointment date**

Card details are handled by Square (not stored on your site). You never touch raw card numbers.

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

Also required: **`SUPABASE_URL`**, **`SUPABASE_SERVICE_ROLE_KEY`**, **`FORMSPREE_BOOKING_ID`** (same form ID as the booking form — sends confirmation email **after deposit is paid**, and **refund emails to you + client CC**)

Run **`sql/invoices.sql`** in Supabase to store Square balance invoices and deposit payments linked to bookings.

Run **`sql/webhook_events.sql`** in Supabase so refund notification emails are not sent twice.

After saving, **deploy** the site.

---

## Step 5 — Refund emails (webhook)

When you issue a **refund in Square**, the client and you both receive a **Formspree email** (client is CC’d).

1. [developer.squareup.com/apps](https://developer.squareup.com/apps) → your app → **Webhooks** → **Add subscription**
2. **Notification URL** (use your live domain exactly):

   `https://blendzbymora.com/.netlify/functions/square-webhook`

   If your site uses `www`, use:

   `https://www.blendzbymora.com/.netlify/functions/square-webhook`

3. Subscribe to events: **`refund.created`**, **`refund.updated`**
4. Copy the subscription **Signature key**
5. In **Netlify → Environment variables**, add:
   - **`SQUARE_WEBHOOK_SIGNATURE_KEY`** = signature key (mark as secret)
   - **`SQUARE_WEBHOOK_NOTIFICATION_URL`** = the **exact same URL** as step 2 (no trailing slash)
6. **Deploy** the site

Square also sends its own refund receipt to the customer; this adds your branded confirmation email to both of you via Formspree.

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

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| No card form after booking | `SQUARE_APPLICATION_ID` and `SQUARE_LOCATION_ID` set in `config.js`? Redeploy |
| “Card payment unavailable” | Application ID matches Production/Sandbox with `SQUARE_ENVIRONMENT` |
| Payment failed | Netlify function logs → `square-deposit-payment`; access token + location ID |
| No balance invoice email | Square Inboxes / spam; Invoices enabled on account |
| **`Exposed secrets detected`** | Uncheck secret on `SQUARE_ACCESS_TOKEN`, `SQUARE_ENVIRONMENT`, `SQUARE_DEPOSIT_PERCENT` |

---

## Files

- `netlify/functions/square-deposit-payment.mjs` — charges deposit, emails balance invoice
- `netlify/functions/square-webhook.mjs` — refund emails to owner + client
- `netlify/functions/lib/square-api.mjs` — Square API helpers
- `app.js` — Square Web Payments card form after booking
- `config.js` — Application ID + Location ID for the card form
