# Twilio SMS — booking confirmation texts

After a customer submits the booking form and the row is saved in **Supabase**, the site calls **`booking-sms`** (Netlify Function). That function loads the booking with the **service role**, formats a short message, and sends it with **Twilio**.

Credentials stay in **Netlify environment variables** only — never in `config.js` or Git.

---

## 1. Twilio setup

1. Create a [Twilio](https://www.twilio.com/) account.
2. In the console, copy **Account SID** and **Auth Token**.
3. Get an SMS-capable **phone number** (or use a Messaging Service SID — this project uses a single **From** number).
4. **Trial accounts** can only text **verified** numbers until you upgrade.

---

## 2. A2P 10DLC (US — so customers actually get the text)

For SMS **to US mobile numbers** from a **US local Twilio number**, carriers expect **A2P 10DLC** registration. Until your **brand + campaign** are approved and your **number is linked** to that campaign, messages may **fail silently**, show errors in Twilio logs, or not reach the customer.

**Complete this in the [Twilio Console](https://console.twilio.com/)** (not in GitHub):

| Step | What to do |
|------|------------|
| 1 | **Upgrade** off **Trial** if you plan to text real customers at scale (add billing). |
| 2 | Go to **Messaging** → **Regulatory Compliance** → **US A2P 10DLC** (or use Twilio’s **“Register for A2P”** prompts on your phone number). |
| 3 | **Brand** — Register **Blendz By Mora** (business details; sole proprietor or LLC flow as applicable). |
| 4 | **Campaign** — Use a type that fits **transactional / customer care** (e.g. *Low Volume Standard*). Describe: customers submit appointments on your site; you send **one confirmation SMS** with service, date, and time. |
| 5 | **Attach your Twilio number** — The same number in **`TWILIO_FROM_NUMBER`** must be **connected to the Messaging Service / campaign** Twilio assigns (follow their final steps). |

**Docs:** [Twilio A2P 10DLC](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc)

**Timeline:** Approval often takes from **same day** to **several business days** (varies by brand type).

**After you’re approved:** Submit a test booking on your **live site** with a normal cell number → check **Twilio → Monitor → Logs → Messaging** for **Delivered**. Your site code does not need to change for 10DLC once the number is compliant in Twilio.

---

## 3. Netlify environment variables

**Site configuration → Environment variables** (same place as Supabase + admin token):

| Key | Value |
|-----|--------|
| `TWILIO_ACCOUNT_SID` | From Twilio console |
| `TWILIO_AUTH_TOKEN` | From Twilio console |
| `TWILIO_FROM_NUMBER` | Your Twilio number in **E.164**, e.g. `+17025551234` |
| `SUPABASE_URL` | Already set for admin — same value |
| `SUPABASE_SERVICE_ROLE_KEY` | Already set for admin — same value |

Optional:

| Key | Value |
|-----|--------|
| `TWILIO_SMS_DISABLED` | Set to `true` to turn off SMS (e.g. local testing without texting) |

---

## 4. Local testing (localhost)

From the project folder:

```bash
npm install
```

**Option A — Copy env from your linked Netlify site (easiest)**  
1. `npx netlify login` (once)  
2. `npx netlify link` — choose your **Blendz By Mora** site (once)  
3. From the project folder, create **`.env`** (gitignored):
   ```bash
   npx netlify env:list --plain --context production > .env
   ```
   Use a **normal hyphen** (`-`) in flags — not an em dash (`—`) from copied text.  
   If you use different values per context, you can try `--context dev` instead.  
4. `npm run dev` — opens a local server (often **http://localhost:8888**)

Then test booking at **http://localhost:8888/** — functions like **`booking-sms`** run locally with those vars.

**Shortcut:** After `netlify link`, you can try **`npm run dev`** first. The CLI often **injects** variables from the linked site (look for a log line like `Injected project settings env vars`). If functions complain about missing env vars, use step 3 above to write **`.env`**.

**Option B — Manual `.env`**  
Copy **`.env.example`** → **`.env`**, fill in keys, then `npm run dev`.

**SMS on trial:** the customer phone on the form must be a **verified** number in Twilio. To test without texting, set **`TWILIO_SMS_DISABLED=true`** in `.env`.

---

## 5. Deploy

Push to Git and let Netlify deploy, or use `npm run dev` locally as above.

Supabase **anonymous** policies must allow **`insert`** and a **`select`** on the new row so the browser can read `id` after insert (your project already uses “Allow anonymous select” on `bookings`).

---

## 6. Message content

Customers receive a short text with their **name**, **service**, **date**, and **time**, plus a note that you’ll confirm by email or phone. Edit the copy in **`netlify/functions/booking-sms.mjs`** (`buildBody`).

---

## 7. Privacy / compliance

- Mention SMS in your **privacy policy** if you add this feature.
- Use for **transactional** appointment notices; separate rules apply for marketing texts.

---

## 8. Troubleshooting (no text received)

1. **SMS only runs if Supabase saves the booking**  
   The form must have **`config.js`** `SUPABASE_URL` + anon key set, and the insert must succeed. SMS is **not** sent for Formspree-only setups.

2. **Supabase must return the new row’s `id`**  
   Anonymous policies need **INSERT** and **SELECT** on `bookings` so `.insert().select('id')` returns an id. If the booking **succeeds** but you see a browser console warning about *“No booking id returned”*, fix RLS (allow anon `SELECT` on `bookings`, same as in README).

3. **Deploy includes the function**  
   Repo must have **`netlify/functions/booking-sms.mjs`**, pushed to Git, and Netlify build must show **Functions** deployed. A **404** on `/.netlify/functions/booking-sms` means it’s missing from deploy.

4. **Netlify env vars (Production)**  
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (+ `SUPABASE_*` for the function). If any are missing, the function **returns 200 with `skipped: true`** — check **Netlify → Functions → booking-sms → Logs** after a test booking.

5. **Twilio trial**  
   The **customer’s** phone on the form must be a **verified** number in Twilio until you upgrade.

6. **US numbers + 10DLC**  
   Twilio may block or fail delivery until **A2P 10DLC** registration is complete. Check **Twilio → Monitor → Logs → Messaging** for the exact error (e.g. 10DLC, unregistered).

   **Warning `30034` — “Message from an Unregistered Number”**  
   Your **Brand** and **Campaign** may be submitted but the **phone number** you send from (`TWILIO_FROM_NUMBER`) must be **added to a Messaging Service** (or otherwise linked) that is tied to an **approved** US A2P campaign. Fix in **Twilio Console → Messaging → Services** (sender pool) and **Regulatory Compliance → US A2P 10DLC** until status is **Approved**, not only “Pending.”

7. **Browser console**  
   After submitting a booking, open **DevTools → Console**. Warnings like **`[Blendz] SMS confirmation failed:`** show the function’s HTTP status/body so you can debug without Netlify logs.

8. **`TWILIO_SMS_DISABLED`**  
   If set to `true` in Netlify (or `.env` locally), no texts are sent.
