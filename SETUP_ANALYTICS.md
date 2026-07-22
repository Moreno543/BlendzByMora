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

### What is tracked

- Public pages (home, book, services, FAQ, etc.)
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
