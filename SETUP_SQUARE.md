# Square deposits & balance invoices

When a client books on **blendzbymora.com**, the site can automatically create a **Square invoice**:

1. **50% deposit** — due immediately (client pays online to secure the appointment)
2. **Remaining balance** — due on the **appointment date**

Square emails the invoice to the client. After booking, the site also shows a **Pay 50% deposit** button.

This replaces Zapier for payments — no extra subscription needed beyond Square.

---

## What you need

- A **Square** seller account (you already have this at [squareup.com](https://squareup.com))
- **Square Invoices** enabled on your account
- A **Square Developer** application (for the API access token)

---

## Step 1 — Developer application & access token

1. Go to [developer.squareup.com/apps](https://developer.squareup.com/apps)
2. **Create an application** (e.g. `BlendzByMora Website`)
3. Open the app → **Credentials**
4. For testing, use **Sandbox** access token and sandbox location ID
5. For live site, use **Production** access token (requires app approval / production credentials)

Copy:

| Credential | Where |
|------------|--------|
| **Access token** | Developer Dashboard → Your app → Credentials |
| **Location ID** | Square Dashboard → **Account & Settings** → **Locations** → click location → copy Location ID |

Or: Developer Dashboard → **Locations** tab for the linked seller account.

---

## Step 2 — Netlify environment variables

**Site configuration → Environment variables → Production:**

| Variable | Example | Required |
|----------|---------|----------|
| **`SQUARE_ACCESS_TOKEN`** | Production access token from Developer Dashboard | Yes |
| **`SQUARE_LOCATION_ID`** | `LXXXXXXXX` | Yes |
| **`SQUARE_ENVIRONMENT`** | `production` or `sandbox` (not sensitive — do **not** mark as secret in Netlify) | Yes |
| **`SQUARE_DEPOSIT_PERCENT`** | `50` | No (default 50) |

You already need **`SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`** for bookings (same as Twilio functions).

After saving, **deploy** the site (or trigger a new deploy).

---

## Step 3 — Test (sandbox recommended first)

1. Set `SQUARE_ENVIRONMENT=sandbox` and use sandbox token + location
2. Submit a test booking on the live or local site (`npx netlify dev`)
3. You should see **Pay 50% deposit** after success — opens Square’s hosted invoice page
4. Pay with a [Square sandbox test card](https://developer.squareup.com/docs/devtools/sandbox/payments)
5. Check **Square Dashboard → Invoices** for deposit + balance schedule

Switch to **production** credentials when ready.

---

## How pricing works

The invoice total is parsed from the service the client selects (e.g. `Soft Glam - $100` → **$100.00**).

- Deposit = **50%** of that total (configurable via `SQUARE_DEPOSIT_PERCENT`)
- Balance = remainder, due on the **appointment date** in the booking form

Services priced **“$100 each”** (e.g. Mother of the Bride) invoice at **$100** as the line total — adjust manually in Square if the party size changes.

---

## If Square is not configured

Bookings still work normally (Supabase + Formspree + optional SMS). The deposit step is skipped until env vars are set.

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| No “Pay deposit” button | Netlify env vars set? Redeploy after adding them |
| **`Exposed secrets detected` build failure** | See below |
| `missing_env` in function logs | `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID` on Production |
| Invoice failed | Square Invoices enabled? Valid location ID? Service string includes `$` price |
| Client didn’t get email | Square sends invoice email; check spam; confirm email on booking |
| Wrong amount | Service name must match site pricing (e.g. `Day-of Bridal Makeup - $300`) |

### Netlify “Exposed secrets detected”

If deploys fail after you add Square env vars:

1. Edit **`SQUARE_ACCESS_TOKEN`** → **uncheck “Contains secret values”** (the token stays in Netlify; it just won’t block builds).
2. Scopes: **uncheck Builds**; keep **Functions** and **Runtime** only.
3. If **`SQUARE_ENVIRONMENT`** or **`SQUARE_DEPOSIT_PERCENT`** are marked secret, **uncheck secret** — values like `production` and `50` appear in docs/code and will block deploys.
4. **Deploys → Trigger deploy → Clear cache and deploy site**.

---

## Files

- `netlify/functions/square-booking-invoice.mjs` — creates customer, order, invoice, publishes
- `netlify/functions/lib/square-api.mjs` — Square API helpers
- `app.js` — calls the function after a successful booking
