# Private appointment dashboard (`admin.html`)

View bookings in a **date range** you choose (Las Vegas calendar dates, same idea as your booking timezone).

- **Default** (no dates in the form): **today through next Friday** in Vegas. If today **is** Friday, the window runs through the **following** Friday so you always get a full week ahead, not a single day.
- **Custom**: set **From** / **To** and click **Apply range**, or use **Next 14 days** / **Next 30 days** (based on your computer’s local “today”).

This page is **not** linked anywhere on the public site. Bookmark:

`https://your-site.netlify.app/admin.html`

---

## How it works

1. **`admin.html`** — login form (token only; no password in Git).
2. **`netlify/functions/admin-bookings.mjs`** — server-side function uses **`SUPABASE_SERVICE_ROLE_KEY`** to read **`bookings`** for the requested range (max **120** days), including **`sms_confirmed_at`** (set when the client texts **YES**). Use **SMS confirmation** filters: **All**, **SMS confirmed**, or **Not confirmed**. Your **anon** key stays in `config.js` for the public booking form only.

**API (POST JSON):**

- `{ "token": "…" }` — default Vegas week through next Friday.
- `{ "token": "…", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }` — inclusive range; both required if you send either.
- Optional **`confirmFilter`:** `"all"` (default), `"confirmed"`, or `"unconfirmed"` — matches **`bookings.sms_confirmed_at`** set vs unset.

---

## One-time setup (Netlify)

### 1. Environment variables

**Site configuration → Environment variables:**

| Key | Value |
|-----|--------|
| `ADMIN_DASHBOARD_TOKEN` | Long random secret (e.g. 32+ chars). **You type this on `admin.html` when you log in.** |
| `SUPABASE_URL` | Same as `config.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → **Settings → API** → **service_role** (secret) |

Do **not** put `ADMIN_DASHBOARD_TOKEN` or the service role key in `config.js` or Git.

### 2. Deploy from Git

Netlify must install dependencies and deploy **Functions** (needs `package.json` + `netlify.toml`). **Drag-and-drop only** may not run the function — use **Import from Git**.

### 3. After changing env vars

**Deploys → Trigger deploy → Clear cache and deploy.**

---

## Local testing

From the project folder:

```bash
npm install
npx netlify dev
```

Open the URL Netlify prints (often `http://localhost:8888`) and go to **`/admin.html`**.

---

## “Could not load appointments (504)” on the live site

A **504** means Netlify’s edge gave up waiting for the function (often **~10 seconds** on the Free plan), usually after the function was **idle** (“cold start”) plus time to reach Supabase.

**What we do in code:** the admin page **retries** a few times on 502/504, and the function requests only the columns it needs (smaller/faster response).

**If it still happens:** In Netlify → your site → **Project configuration** → **Functions**, increase the **function timeout** if your plan allows (Pro and up). You can also trigger a fresh deploy (**Deploys → Trigger deploy**) so the latest function bundle is live.

---

## Security notes

- Anyone who knows **`/admin.html`** + your **`ADMIN_DASHBOARD_TOKEN`** can read bookings in ranges you query. Use a **strong token** and don’t share it.
- The service role key must **only** live in Netlify env, never in the browser.
- `robots.txt` disallows `/admin.html` to reduce casual discovery (not a security guarantee).

---

## Changing the default date range

Edit **`netlify/functions/lib/vegas-dates.mjs`** (`rangeTodayThroughNextFriday`) and redeploy. The admin UI always overrides this when you set **From** / **To**.
