/**
 * Private schedule dashboard — calls Netlify function with token (never store in repo).
 */
(function () {
  const STORAGE_KEY = 'bbm_admin_token';
  const fnPath = '/.netlify/functions/admin-bookings';

  const loginSection = document.getElementById('admin-login');
  const dashboardSection = document.getElementById('admin-dashboard');
  const form = document.getElementById('admin-login-form');
  const tokenInput = document.getElementById('admin-token');
  const errEl = document.getElementById('admin-error');
  const rangeEl = document.getElementById('admin-range');
  const countEl = document.getElementById('admin-count');
  const tbody = document.getElementById('admin-tbody');
  const confirmFilterWrap = document.getElementById('admin-confirm-filters');
  const refreshBtn = document.getElementById('admin-refresh');
  const logoutBtn = document.getElementById('admin-logout');
  const loadingEl = document.getElementById('admin-loading');
  const dateFrom = document.getElementById('admin-date-from');
  const dateTo = document.getElementById('admin-date-to');
  const applyRangeBtn = document.getElementById('admin-apply-range');
  const presetDefault = document.getElementById('admin-preset-default');
  const preset14 = document.getElementById('admin-preset-14');
  const preset30 = document.getElementById('admin-preset-30');

  let confirmFilter = 'all';

  /** Same order as netlify/functions/admin-bookings.mjs — earliest date/time first. */
  const SLOT_ORDER = ['8:00 AM', '10:00 AM', '12:00 PM', '2:00 PM', '4:00 PM'];

  function sortDateKey(row) {
    const s = String(row?.date ?? '');
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
  }

  function slotRank(time) {
    const t = String(time ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
    if (!t) return 999;
    const idx = SLOT_ORDER.findIndex((slot) => slot.toLowerCase() === t);
    return idx === -1 ? 999 : idx;
  }

  function sortBookingsLocal(rows) {
    return [...(rows || [])].sort((a, b) => {
      const dc = sortDateKey(a).localeCompare(sortDateKey(b));
      if (dc !== 0) return dc;
      const tr = slotRank(a.time) - slotRank(b.time);
      if (tr !== 0) return tr;
      const tc = String(a.time || '').localeCompare(String(b.time || ''), undefined, {
        numeric: true,
      });
      if (tc !== 0) return tc;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }

  function showError(msg) {
    errEl.textContent = msg || '';
    errEl.style.display = msg ? 'block' : 'none';
  }

  function getToken() {
    return sessionStorage.getItem(STORAGE_KEY) || '';
  }

  function setToken(t) {
    if (t) sessionStorage.setItem(STORAGE_KEY, t);
    else sessionStorage.removeItem(STORAGE_KEY);
  }

  /** Local calendar YYYY-MM-DD (for presets on your computer). */
  function localYmd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function addLocalDays(ymd, deltaDays) {
    const [y, mo, d] = ymd.split('-').map(Number);
    const dt = new Date(y, mo - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    return localYmd(dt);
  }

  /** Netlify cold starts + DB can exceed edge timeout; retry without invalid netlify.toml syntax. */
  async function fetchBookingsWithRetry(body) {
    const opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    };
    const delays = [0, 1200, 2800];
    let lastRes = null;
    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]));
      lastRes = await fetch(fnPath, opts);
      if (lastRes.ok || lastRes.status === 401 || lastRes.status === 400) break;
      if (lastRes.status !== 502 && lastRes.status !== 504) break;
    }
    return lastRes;
  }

  /** Empty both → default week on server; both filled → custom range; one only → invalid. */
  function rangeForRequest() {
    const from = (dateFrom.value || '').trim();
    const to = (dateTo.value || '').trim();
    if (!from && !to) return { ok: true, extra: {} };
    if (from && to) {
      if (from > to) {
        return { ok: false, message: 'From date must be on or before To date.' };
      }
      return { ok: true, extra: { start: from, end: to } };
    }
    return {
      ok: false,
      message: 'Fill both From and To, or clear both and use “Default week”.',
    };
  }

  function syncConfirmFilterButtons() {
    if (!confirmFilterWrap) return;
    confirmFilterWrap.querySelectorAll('[data-confirm-filter]').forEach((btn) => {
      const v = btn.getAttribute('data-confirm-filter');
      btn.classList.toggle('btn-admin-filter-active', v === confirmFilter);
    });
  }

  async function loadBookings() {
    const token = getToken();
    if (!token) {
      loginSection.hidden = false;
      dashboardSection.hidden = true;
      return;
    }

    const rangeCheck = rangeForRequest();
    if (!rangeCheck.ok) {
      showError(rangeCheck.message);
      return;
    }

    showError('');
    loadingEl.hidden = false;
    tbody.innerHTML = '';
    syncConfirmFilterButtons();

    const body = { token, confirmFilter, ...rangeCheck.extra };

    try {
      const res = await fetchBookingsWithRetry(body);
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        setToken('');
        loginSection.hidden = false;
        dashboardSection.hidden = true;
        showError('Session expired or invalid token. Please sign in again.');
        return;
      }

      if (!res.ok) {
        const base = data.error || `Could not load appointments (${res.status}).`;
        const extra =
          res.status === 504 || res.status === 502
            ? ' The server timed out (common right after idle). Tap Refresh or try again in a moment.'
            : '';
        showError(base + extra);
        return;
      }

      loginSection.hidden = true;
      dashboardSection.hidden = false;
      if (data.range?.start) dateFrom.value = data.range.start;
      if (data.range?.end) dateTo.value = data.range.end;
      rangeEl.textContent = data.range?.label || '';
      countEl.textContent = data.count != null ? String(data.count) : '—';

      if (data.confirmFilter && ['all', 'confirmed', 'unconfirmed'].includes(data.confirmFilter)) {
        confirmFilter = data.confirmFilter;
        syncConfirmFilterButtons();
      }

      const rows = sortBookingsLocal(data.bookings || []);
      if (rows.length === 0) {
        const hint =
          confirmFilter === 'confirmed'
            ? ' No appointments in this range have an SMS YES yet.'
            : confirmFilter === 'unconfirmed'
              ? ' Every appointment in this range is SMS-confirmed, or there are none.'
              : '';
        tbody.innerHTML = `<tr><td colspan="11" class="admin-empty" data-label="">No appointments in this date range.${escapeHtml(hint)}</td></tr>`;
        return;
      }

      let lastDate = '';
      for (const r of rows) {
        const dateStr = r.date || '';
        const showDate = dateStr !== lastDate;
        lastDate = dateStr;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td data-label="Date" class="admin-nowrap">${cell(showDate ? dateStr : '')}</td>
          <td data-label="Time" class="admin-nowrap">${cell(r.time || '')}</td>
          <td data-label="Service">${cell(r.service || '')}</td>
          <td data-label="Name">${cell(r.name || '')}</td>
          <td data-label="Email">${emailCell(r.email)}</td>
          <td data-label="Phone">${phoneCell(r.phone)}</td>
          <td data-label="Travel" class="admin-nowrap">${cell(r.travel || '')}</td>
          <td data-label="Notes" class="admin-notes admin-td-notes">${notesCell(r.notes)}</td>
          <td data-label="IP" class="admin-nowrap">${cell(r.client_ip || '')}</td>
          <td data-label="SMS opt-in" class="admin-nowrap">${cell(r.sms_consent ? 'Yes' : 'No')}</td>
          <td data-label="SMS YES" class="admin-nowrap">${smsYesCell(r)}</td>
        `;
        tbody.appendChild(tr);
      }
    } catch (e) {
      console.error(e);
      showError(
        'Could not reach the admin API. Use your live Netlify URL or run `npx netlify dev` locally.'
      );
    } finally {
      loadingEl.hidden = true;
    }
  }

  /** Plain text in a span for mobile nowrap / layout. */
  function cell(text) {
    const t = escapeHtml(text);
    return t ? `<span class="admin-cell-value">${t}</span>` : '';
  }

  function emailCell(email) {
    if (!email) return '';
    const e = escapeHtml(email);
    return `<span class="admin-cell-value"><a href="mailto:${escapeAttr(email)}">${e}</a></span>`;
  }

  function phoneCell(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    const display = escapeHtml(phone);
    return `<span class="admin-cell-value"><a href="tel:${escapeAttr(digits)}">${display}</a></span>`;
  }

  function notesCell(notes) {
    const t = escapeHtml(notes || '');
    return t ? `<span class="admin-cell-value">${t}</span>` : '';
  }

  function formatConfirmAt(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso || '');
      return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return String(iso || '');
    }
  }

  function smsYesCell(r) {
    if (!r.sms_confirmed_at) {
      return '<span class="admin-cell-value" style="color:var(--color-text-muted)">—</span>';
    }
    const dt = formatConfirmAt(r.sms_confirmed_at);
    return `<span class="admin-cell-value">${escapeHtml(dt)}</span>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = (tokenInput.value || '').trim();
    if (!t) {
      showError('Enter your admin token.');
      return;
    }
    setToken(t);
    tokenInput.value = '';
    dateFrom.value = '';
    dateTo.value = '';
    loadBookings();
  });

  applyRangeBtn.addEventListener('click', () => loadBookings());

  presetDefault.addEventListener('click', () => {
    dateFrom.value = '';
    dateTo.value = '';
    loadBookings();
  });

  preset14.addEventListener('click', () => {
    const start = localYmd(new Date());
    dateFrom.value = start;
    dateTo.value = addLocalDays(start, 13);
    loadBookings();
  });

  preset30.addEventListener('click', () => {
    const start = localYmd(new Date());
    dateFrom.value = start;
    dateTo.value = addLocalDays(start, 29);
    loadBookings();
  });

  refreshBtn.addEventListener('click', () => loadBookings());

  if (confirmFilterWrap) {
    confirmFilterWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-confirm-filter]');
      if (!btn) return;
      const v = btn.getAttribute('data-confirm-filter');
      if (!v || v === confirmFilter) return;
      confirmFilter = v;
      syncConfirmFilterButtons();
      loadBookings();
    });
  }

  logoutBtn.addEventListener('click', () => {
    setToken('');
    loginSection.hidden = false;
    dashboardSection.hidden = true;
    tbody.innerHTML = '';
    confirmFilter = 'all';
    syncConfirmFilterButtons();
    dateFrom.value = '';
    dateTo.value = '';
    showError('');
  });

  if (getToken()) {
    loginSection.hidden = true;
    dashboardSection.hidden = false;
    loadBookings();
  }
})();
