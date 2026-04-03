# Twilio SMS — full setup (confirmations, 24h reminders, YES replies)

This site can:

1. **After booking** — Text the customer a short confirmation (Netlify **`booking-sms`**).
2. **~24 hours before** the appointment — One reminder text per booking (Netlify **`booking-reminders`**, runs **every hour** UTC).
3. **Inbound** — Customer texts **YES** → **`bookings.sms_confirmed_at`** is set (filter **SMS confirmed** on **`admin.html`**); optional SMS to your phone (**`twilio-inbound-sms`**).

You need **US A2P 10DLC** (brand + campaign + number on a Messaging Service) for reliable US SMS. See [Twilio A2P 10DLC](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc).

---

## Step 1 — Supabase (SQL Editor)

1. Open [Supabase](https://supabase.com) → your project → **SQL Editor** → **New query**.
2. Paste **everything** below → **Run** once.

```sql
-- ── A) Required for 24h reminders (safe to run again) ─────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- ── B) SMS “Reply YES” → timestamp on the booking (safe to run again) ─────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS sms_confirmed_at TIMESTAMPTZ;
```

3. You should see **Success**.  
   - **`reminder_sent_at`** — `NULL` until a reminder is sent; then the job won’t send twice for that row.  
   - **`sms_confirmed_at`** — `NULL` until the client texts **YES**; then set to the time of that message. Filter **SMS confirmed** / **Not confirmed** on **`admin.html`**.

*(Optional audit log: `sql/booking_confirmations.sql` creates a separate table — not required for the site or admin.)*

---

## Step 2 — Netlify environment variables

1. [Netlify](https://app.netlify.com) → your site → **Site configuration** → **Environment variables**.
2. Add **each** variable (same values for **Production**; add **Deploy previews** if you test PRs).

| Variable | Required? | Where to get it |
|----------|-------------|-----------------|
| **`SUPABASE_URL`** | Yes | Supabase → **Project Settings** → **API** → **Project URL** |
| **`SUPABASE_SERVICE_ROLE_KEY`** | Yes | Supabase → **Project Settings** → **API** → **`service_role`** (secret — never put in `config.js` or Git) |
| **`TWILIO_ACCOUNT_SID`** | Yes for SMS | Twilio [Console](https://console.twilio.com) dashboard (starts with `AC`) |
| **`TWILIO_AUTH_TOKEN`** | Yes | Twilio Console — **Account** token (click to reveal) |
| **`TWILIO_FROM_NUMBER`** | Yes | Your Twilio number in **E.164**, e.g. `+17253301234` (Messaging-capable, on your A2P campaign / Messaging Service) |
| **`TWILIO_OWNER_NOTIFY_PHONE`** | No | **Your** cell in E.164 — get an SMS when someone texts **YES** (uses your Twilio number as sender) |
| **`TWILIO_SMS_DISABLED`** | No | Set to `true` to turn **off** all outbound/inbound SMS processing in functions (local testing) |

3. **Save**, then trigger a **new deploy** (or **Clear cache and deploy**) so functions pick up env vars.

---

## Step 3 — Twilio phone number (inbound webhook)

1. Twilio → **Phone Numbers** → **Manage** → **Active numbers** → your number.  
2. Under **Messaging** → **A message comes in** → **Webhook**, **HTTP POST**.  
3. URL:  
   `https://YOUR_DOMAIN/.netlify/functions/twilio-inbound-sms`  
   Example: `https://blendzbymora.com/.netlify/functions/twilio-inbound-sms`  
4. Save.

---

## Step 4 — Twilio Messaging Service + A2P

1. **Messaging** → **Services** — use the service tied to your campaign (e.g. BlendzByMora).  
2. Add your **Twilio number** to the service **Sender pool**.  
3. **Regulatory Compliance** → **US A2P 10DLC** — **Brand** approved, **Campaign** approved, campaign **linked** to that Messaging Service (fixes common **30034** errors).

### Blendz By Mora — A2P resource IDs (saved from Console)

Registration was completed in the Twilio wizard; **campaign vetting** can take time. Until the campaign shows **approved**, some US traffic may stay blocked. Check status in **[Twilio A2P / Regulatory Compliance](https://console.twilio.com/us1/develop/sms/regulatory-compliance/a2p-10dlc)** (open each SID below).

These SIDs are **not** secret like your Auth Token — they’re stable references for support and your own notes.

| Resource | SID |
|----------|-----|
| **Customer Profile** | `BU0b7505cb5373f7f43051183a9d750f19` |
| **A2P Brand** | `BNcb7a5fae82874a03d3aae1d1a07bcbf5` |
| **A2P Campaign** | `CM94d21647fc7692a2d93fa5b2a3b98fd1` |

After vetting: confirm **`+17253307284`** (or your current sender) is still in the **Messaging Service** linked to **this** campaign.

---

## Step 5 — Deploy and test

1. Push the repo; confirm **Netlify** shows **Functions**: `booking-sms`, `booking-reminders`, `twilio-inbound-sms`, `admin-bookings`.  
2. **Booking SMS:** Submit a real booking on the **live** site → check **Twilio → Monitor → Logs → Messaging**.  
3. **Reminder:** After deploy, the scheduler runs **hourly**; a booking **~24h** ahead (Las Vegas slot time) with `reminder_sent_at` null should get **one** reminder.  
4. **YES:** From the phone on the booking, text **YES** to your Twilio number → **`bookings.sms_confirmed_at`** updates in Supabase; see **`admin.html`** (filter **SMS confirmed**); optional alert to **`TWILIO_OWNER_NOTIFY_PHONE`**.

**Trial accounts:** Until upgraded, you can only SMS **verified** numbers in Twilio.

**Local:** `npm run dev` with `.env` from `netlify env:pull` or copy `.env.example` — see README.

---

## Edit message text

- Immediate confirmation: `netlify/functions/booking-sms.mjs` → `buildBody`  
- ~24h reminder: `netlify/functions/booking-reminders.mjs` → `buildReminderBody`  
- Inbound auto-replies: `netlify/functions/twilio-inbound-sms.mjs`

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| No SMS at all | Env vars on Netlify, A2P/campaign, number in Messaging Service, Twilio error logs |
| 30034 / undelivered | Campaign not linked to the **same** Messaging Service as the sender number |
| Reminder never sends | `reminder_sent_at` column exists; appointment ~23–25h away in **America/Los_Angeles**; hourly cron ran |
| YES does nothing | Inbound webhook URL exact **https** host/path; column **`sms_confirmed_at`** on **`bookings`** exists; phone on booking matches sender digits |
| Inbound 403 | Twilio **signature** — webhook URL in Twilio must match the URL Netlify uses (no wrong subdomain or trailing slash) |
