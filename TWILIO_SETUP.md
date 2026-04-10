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

-- ── C) A2P 10DLC — optional SMS opt-in on the booking form (not required to submit) ──
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN NOT NULL DEFAULT false;
```

3. You should see **Success**.  
   - **`reminder_sent_at`** — `NULL` until a reminder is sent; then the job won’t send twice for that row.  
   - **`sms_confirmed_at`** — `NULL` until the client texts **YES**; then set to the time of that message. Filter **SMS confirmed** / **Not confirmed** on **`admin.html`**.  
   - **`sms_consent`** — `true` only if the customer checked the SMS consent box; **`booking-sms`** and **`booking-reminders`** send only when `true` (see `book.html` + Privacy/Terms).

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
| **`TWILIO_LOOKUP_DISABLED`** | No | Set to `true` to **skip** [Twilio Lookup](https://www.twilio.com/docs/lookup) on the booking form (saves API cost while testing locally). **Production:** omit this or leave unset so phone numbers are validated as real/routable (no SMS code — same flow as email checks). Uses the same **`TWILIO_ACCOUNT_SID`** and **`TWILIO_AUTH_TOKEN`**. |

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

### A2P resource IDs (keep privately — not in Git)

After you register, Twilio shows **Customer Profile**, **Brand**, and **Campaign** SIDs in the A2P console. **Do not paste real SIDs into this repo** — Netlify’s build can fail with **“Exposed secrets detected.”** Store them in a password manager or private notes instead.

Check status in **[Twilio A2P / Regulatory Compliance](https://console.twilio.com/us1/develop/sms/regulatory-compliance/a2p-10dlc)**.

After vetting: confirm your **sending number** is still in the **Messaging Service** linked to **this** campaign.

---

## Step 5 — Deploy and test

1. Push the repo; confirm **Netlify** shows **Functions** including `lookup-phone`, `booking-sms`, `booking-reminders`, `twilio-inbound-sms`, `admin-bookings`.  
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

Messages include **HELP** / **STOP** language for carrier / A2P sample requirements. When you **resubmit your 10DLC campaign** in Twilio, use samples consistent with production, for example:

- **Transactional / confirmation (sample):**  
  `Blendz By Mora: Hi [Name]! We received your request — [Service] on [Date] at [Time]. We'll confirm by email or phone. Reminder ~24h before appt. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`

- **Reminder (sample):**  
  `Blendz By Mora: Hello [Name]. Reminder: your [Service] is on [Date] at [Time] (~24h). Reply YES to confirm. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`

Opt-in on the live site: **`book.html`** optional checkbox (not pre-checked, not required) + links to **Privacy** and **Terms**.

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| No SMS at all | Env vars on Netlify, A2P/campaign, number in Messaging Service, Twilio error logs |
| No confirmation after booking | Customer must **check** the SMS opt-in box on **`book.html`**; **`sms_consent`** must be `true` in **`bookings`** (run **`sql/sms_consent.sql`** if the column is missing) |
| 30034 / undelivered | Campaign not linked to the **same** Messaging Service as the sender number |
| Reminder never sends | `reminder_sent_at` column exists; appointment ~23–25h away in **America/Los_Angeles**; hourly cron ran |
| YES does nothing | Inbound webhook URL exact **https** host/path; column **`sms_confirmed_at`** on **`bookings`** exists; phone on booking matches sender digits |
| Inbound 403 | Twilio **signature** — webhook URL in Twilio must match the URL Netlify uses (no wrong subdomain or trailing slash) |
