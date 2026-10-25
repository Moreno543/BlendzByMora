# Website traffic analytics

You can see **daily visitors**, **page views**, and **which pages people visit** in a free dashboard.

## Recommended: Google Analytics 4 (free)

### 1. Create a GA4 property

1. Go to [analytics.google.com](https://analytics.google.com) and sign in with your Google account.
2. **Admin** (gear, bottom left) → **Create** → **Property**.
3. Property name: **Blendz By Mora**
4. Time zone: **United States – Pacific Time**
5. Create a **Web** data stream for `https://blendzbymora.com`
6. Copy the **Measurement ID** (looks like `G-XXXXXXXXXX`).

### 2. Add the ID to your site

In **`config.js`**, set:

```javascript
GA_MEASUREMENT_ID: 'G-XXXXXXXXXX',
```

Deploy (push to GitHub / Netlify). After a few minutes, visits will appear in GA4.

### 3. Where to view traffic

Open [analytics.google.com](https://analytics.google.com) → your property:

| Report | What it shows |
|--------|------------------|
| **Reports → Realtime** | Who is on the site right now |
| **Reports → Acquisition → Traffic acquisition** | How people found you (Google, direct, social, etc.) |
| **Reports → Engagement → Pages and screens** | Most visited pages |
| **Reports → User → Demographics** | City / country (approximate) |

For **visitors per day**, use **Reports → Engagement → Overview** or build a custom exploration with date as the dimension.

**Note:** New properties can take **24–48 hours** before all reports populate. Realtime works within minutes.

### Booking drop-off (where people stop)

These events fire on `book.html` only. They do **not** include names, emails, or phone numbers.

| Event | Meaning |
|-------|---------|
| `booking_view` | Opened the booking page |
| `booking_service_selected` | Picked a glam |
| `booking_datetime_selected` | Picked a date and time |
| `booking_checkout_started` | Passed checks and started save (Continue to checkout) |
| `booking_deposit_shown` | Deposit / payment screen appeared |
| `booking_payment_attempt` | Tapped Pay, Apple Pay, or Google Pay |
| `booking_payment_success` | Deposit went through |
| `booking_payment_failed` | Payment was declined or cancelled |
| `booking_drop` | Hit an error (`step`: contact, captcha, agreement, email, phone, slot, save) |

In GA4: **Reports → Realtime → Event count by Event name**, or **Explore → Funnel exploration** with those events in order.

**If the deposit is the stop:** `booking_deposit_shown` will be much higher than `booking_payment_success`. Failed attempts show as `booking_payment_failed`.

**Admin dashboard:** filter **Deposit → Unpaid**. Those people submitted the form and reached checkout but never paid. Paid vs Unpaid also shows as a column on each row.

### What is tracked

- Public pages (home, book, services, FAQ, etc.)
- Booking steps listed above
- **Not** tracked: `admin.html` (private dashboard)

---

## Alternative: Netlify Analytics (paid add-on)

If you prefer everything inside Netlify with no Google account:

1. [Netlify dashboard](https://app.netlify.com) → your site → **Analytics**
2. Enable **Netlify Analytics** (paid add-on, ~$9/month)
3. View daily page views and top URLs in the Netlify UI — no code changes needed.

---

## Privacy

The privacy policy mentions Google Analytics. If you turn analytics on, keep that section; if you leave `GA_MEASUREMENT_ID` empty, no analytics script runs.
