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
  const refreshBtn = document.getElementById('admin-refresh');
  const logoutBtn = document.getElementById('admin-logout');
  const loadingEl = document.getElementById('admin-loading');
  const dateFrom = document.getElementById('admin-date-from');
  const dateTo = document.getElementById('admin-date-to');
  const applyRangeBtn = document.getElementById('admin-apply-range');
  const presetDefault = document.getElementById('admin-preset-default');
  const preset14 = document.getElementById('admin-preset-14');
  const preset30 = document.getElementById('admin-preset-30');

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

    const body = { token, ...rangeCheck.extra };

    try {
      const res = await fetch(fnPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        setToken('');
        loginSection.hidden = false;
        dashboardSection.hidden = true;
        showError('Session expired or invalid token. Please sign in again.');
        return;
      }

      if (!res.ok) {
        showError(data.error || `Could not load appointments (${res.status}).`);
        return;
      }

      loginSection.hidden = true;
      dashboardSection.hidden = false;
      if (data.range?.start) dateFrom.value = data.range.start;
      if (data.range?.end) dateTo.value = data.range.end;
      rangeEl.textContent = data.range?.label || '';
      countEl.textContent = data.count != null ? String(data.count) : '—';

      const rows = data.bookings || [];
      if (rows.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="8" class="admin-empty">No appointments in this date range.</td></tr>';
        return;
      }

      let lastDate = '';
      for (const r of rows) {
        const dateStr = r.date || '';
        const showDate = dateStr !== lastDate;
        lastDate = dateStr;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${showDate ? escapeHtml(dateStr) : ''}</td>
          <td>${escapeHtml(r.time || '')}</td>
          <td>${escapeHtml(r.service || '')}</td>
          <td>${escapeHtml(r.name || '')}</td>
          <td><a href="mailto:${escapeAttr(r.email)}">${escapeHtml(r.email || '')}</a></td>
          <td><a href="tel:${escapeAttr(String(r.phone || '').replace(/\D/g, ''))}">${escapeHtml(r.phone || '')}</a></td>
          <td>${escapeHtml(r.travel || '')}</td>
          <td class="admin-notes">${escapeHtml(r.notes || '')}</td>
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
  logoutBtn.addEventListener('click', () => {
    setToken('');
    loginSection.hidden = false;
    dashboardSection.hidden = true;
    tbody.innerHTML = '';
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
