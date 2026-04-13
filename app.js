/**
 * Blendz By Mora - Main Application
 */

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.hash === '#book' && !document.getElementById('booking-form')) {
    window.location.replace('book.html');
    return;
  }

  const bookingForm = document.getElementById('booking-form');
  if (bookingForm) {
    const sel = document.getElementById('service');
    const params = new URLSearchParams(window.location.search);
    const q = params.get('service');
    if (q && sel) {
      try {
        sel.value = decodeURIComponent(q);
      } catch (_) {}
      history.replaceState(null, '', window.location.pathname);
      sessionStorage.removeItem('booking-service');
    } else {
      const stored = sessionStorage.getItem('booking-service');
      if (stored && sel) {
        sel.value = stored;
        sessionStorage.removeItem('booking-service');
      }
    }
    if (window.location.hash === '#book') {
      window.scrollTo(0, 0);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  initMobileMenu();
  initInPageHashScrollOnLoad();
  initNavScroll();
  initDatePicker();
  initBookingForm();
  initTravelNotes();
  initReviewForm();
  loadReviews();
  initGoogleReviewLink();
  initBookingScrollAndHighlight();
  initServiceBookButtons();
});

function initServiceBookButtons() {
  const header = document.querySelector('.header');
  const headerOffset = () => (header ? header.offsetHeight : 80);

  document.querySelectorAll('.btn-service[data-service]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const serviceValue = btn.getAttribute('data-service');
      const serviceSelect = document.getElementById('service');
      const bookSection = document.getElementById('book');

      if (bookSection) {
        if (serviceSelect && serviceValue) serviceSelect.value = serviceValue;
        const y = bookSection.getBoundingClientRect().top + window.scrollY - headerOffset();
        window.scrollTo({ top: y, behavior: 'smooth' });
        const formRow = serviceSelect?.closest('.form-row');
        if (formRow) {
          setTimeout(() => {
            formRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            formRow.classList.add('highlight-service');
            setTimeout(() => formRow.classList.remove('highlight-service'), 2000);
          }, 300);
        }
      } else {
        if (serviceValue) sessionStorage.setItem('booking-service', serviceValue);
        window.location.href = 'book.html';
      }
    });
  });
}

function initBookingScrollAndHighlight() {
  const serviceField = document.getElementById('service');
  const bookSection = document.getElementById('book');
  if (!serviceField || !bookSection) return;

  const header = document.querySelector('.header');
  const headerOffset = () => (header ? header.offsetHeight : 80);

  function scrollToBookSection() {
    const y = bookSection.getBoundingClientRect().top + window.scrollY - headerOffset();
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  if (window.location.hash === '#book') scrollToBookSection();

  document.querySelectorAll('a[href="#book"]:not([data-service])').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const nav = document.querySelector('.nav');
      if (nav) nav.classList.remove('open');

      requestAnimationFrame(() => {
        scrollToBookSection();
      });
      history.pushState(null, '', '#book');
    });
  });

  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#book') scrollToBookSection();
  });
}

function initGoogleReviewLink() {
  const link = document.getElementById('google-review-link');
  if (!link) return;
  if (CONFIG.GOOGLE_PLACE_ID) {
    link.href = `https://search.google.com/local/writereview?placeid=${CONFIG.GOOGLE_PLACE_ID}`;
  } else {
    link.href = CONFIG.GOOGLE_REVIEW_URL || 'https://www.google.com/search?q=BlendzByMora&stick=H4sIAAAAAAAA_-NgU1I1qEhMSzUzNzW2tLBMSUlLszS3MqhINTEzNEtJS04xNzA0MTKyWMTK45STmpdS5VTpm1-UCADuQv8zOAAAAA&hl=en';
    link.title = 'Leave a review for Blendz By Mora on Google';
  }
}

// Mobile menu toggle
function initMobileMenu() {
  const btn = document.querySelector('.mobile-menu-btn');
  const nav = document.querySelector('.nav');
  if (btn && nav) {
    btn.addEventListener('click', () => nav.classList.toggle('open'));
  }
}

/** Re-scroll to #fragment (respects html scroll-padding-top). Safe to call multiple times as layout changes. */
function alignScrollToHashTarget(behavior = 'auto') {
  const h = window.location.hash;
  if (!h || h.length < 2 || h === '#book') return;
  const id = decodeURIComponent(h.slice(1));
  const el = document.getElementById(id);
  if (!el) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'start', behavior });
    });
  });
}

/** Direct visits (e.g. FAQ → index.html#contact): align early, again after assets, and after reviews inject (see loadReviews). */
function initInPageHashScrollOnLoad() {
  alignScrollToHashTarget('auto');
  if (window.location.hash && window.location.hash !== '#book') {
    window.addEventListener('load', () => alignScrollToHashTarget('auto'), { once: true });
  }
}

// Nav scroll: scrollIntoView respects html scroll-padding-top (fixed header)
function initNavScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    const href = link.getAttribute('href');
    if (href === '#') return;
    const targetId = href.slice(1);
    if (targetId === 'book') return;
    const target = document.getElementById(targetId);
    if (!target) return;

    link.addEventListener('click', (e) => {
      e.preventDefault();
      const nav = document.querySelector('.nav');
      if (nav) nav.classList.remove('open');

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          target.scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
      });
      history.pushState(null, '', href);
    });
  });
}

// Date picker: visible calendar, Mon-Sat only, min = today
let flatpickrInstance = null;

const BOOKING_TIME_SLOTS = ['8:00 AM', '10:00 AM', '12:00 PM', '2:00 PM', '4:00 PM'];

/** Bumps when date cleared / new request — stale async Supabase responses must not repaint the time list */
let updateTimeSlotsSeq = 0;

function getBookingTimezone() {
  try {
    const tz = typeof CONFIG !== 'undefined' && CONFIG.BOOKING_TIMEZONE;
    return tz && String(tz).trim() ? String(tz).trim() : 'America/Los_Angeles';
  } catch (_) {
    return 'America/Los_Angeles';
  }
}

/** YYYY-MM-DD for "today" in BOOKING_TIMEZONE (must match slot logic; not device local date). */
function bookingZoneTodayStr() {
  try {
    const p = zonedWallClockParts(Date.now(), getBookingTimezone());
    if (!p || [p.y, p.mo, p.d].some((n) => Number.isNaN(n))) {
      return calendarDateStr(new Date());
    }
    return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  } catch (_) {
    return calendarDateStr(new Date());
  }
}

/** Keep Flatpickr minDate aligned with Vegas calendar (fixes Chrome vs Safari / preview vs device). */
function syncFlatpickrMinDateToBookingZone() {
  if (!flatpickrInstance) return;
  try {
    flatpickrInstance.set('minDate', bookingZoneTodayStr());
  } catch (_) {}
}

/** Calendar parts for an instant in a given IANA zone (for slot math) */
function zonedWallClockParts(utcMs, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });
  const parts = {};
  fmt.formatToParts(new Date(utcMs)).forEach((x) => {
    if (x.type !== 'literal') parts[x.type] = x.value;
  });
  return {
    y: parseInt(parts.year, 10),
    mo: parseInt(parts.month, 10),
    d: parseInt(parts.day, 10),
    h: parseInt(parts.hour, 10),
    min: parseInt(parts.minute, 10),
  };
}

/**
 * UTC epoch ms for when the wall clock reads (Y-M-D, hour24:minute) in `timeZone`.
 */
function utcMsForZonedWallClock(dateStr, hour24, minute, timeZone) {
  const norm = normalizeDateStr(dateStr);
  const [y, mo, d] = norm.split('-').map(Number);
  if (!norm || [y, mo, d].some((n) => Number.isNaN(n))) return NaN;
  const key = (yy, m, dd, hh, mm) => yy * 1e8 + m * 1e6 + dd * 1e4 + hh * 100 + mm;
  const target = key(y, mo, d, hour24, minute);
  let lo = Date.UTC(y, mo - 1, d, 0, 0, 0) - 14 * 3600000;
  let hi = Date.UTC(y, mo - 1, d, 23, 59, 59) + 14 * 3600000;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const p = zonedWallClockParts(mid, timeZone);
    const cur = key(p.y, p.mo, p.d, p.h, p.min);
    if (cur === target) return Math.floor(mid);
    if (cur < target) lo = mid;
    else hi = mid;
  }
  return NaN;
}

function parseTimeLabelToHour24Minute(timeLabel) {
  const m = timeLabel.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return { h, min };
}

/** Instant (UTC) when appointment slot starts — uses BOOKING_TIMEZONE (Las Vegas) */
function parseSlotDateTime(dateStr, timeLabel) {
  const norm = normalizeDateStr(dateStr);
  if (!norm) return new Date(NaN);
  const hm = parseTimeLabelToHour24Minute(timeLabel);
  if (!hm) return new Date(NaN);
  const tz = getBookingTimezone();
  try {
    const ms = utcMsForZonedWallClock(norm, hm.h, hm.min, tz);
    if (Number.isNaN(ms)) return new Date(NaN);
    return new Date(ms);
  } catch (err) {
    console.warn('BOOKING_TIMEZONE parse failed, using device local time:', err);
    const parts = norm.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return new Date(NaN);
    const [y, mo, d] = parts;
    return new Date(y, mo - 1, d, hm.h, hm.min, 0, 0);
  }
}

function clearSelectionIfDayFullyClosed() {
  if (!flatpickrInstance) return;
  const dateInput = document.getElementById('date');
  if (!dateInput) return;
  const raw = flatpickrInstance.input.value || dateInput.value;
  const ds = normalizeDateStr(raw);
  if (!ds || dayHasAnyBookableSlot(ds)) return;
  flatpickrInstance.clear();
  updateTimeSlots('');
}

function initDatePicker() {
  const dateInput = document.getElementById('date');
  if (!dateInput) return;

  const timeSelect = document.getElementById('time');
  if (timeSelect) {
    timeSelect.innerHTML = '<option value="">Select a date first</option>';
  }

  const blackoutSet = new Set(CONFIG.BLACKOUT_DATES || []);
  const range = CONFIG.BLACKOUT_RANGE;
  const blockWeekdays = new Set(range?.blockWeekdays || []);

  function flatpickrDateStr(selectedDates, dateStr) {
    if (dateStr && typeof dateStr === 'string') return normalizeDateStr(dateStr);
    if (selectedDates && selectedDates[0]) return calendarDateStr(selectedDates[0]);
    return '';
  }

  function flatpickrCellDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  flatpickrInstance = flatpickr(dateInput, {
    dateFormat: 'Y-m-d',
    minDate: bookingZoneTodayStr(),
    disable: [
      function (date) {
        try {
          const dateStr = flatpickrCellDateStr(date);
          if (blackoutSet.has(dateStr)) return true;
          if (range?.start && range?.end && blockWeekdays.size) {
            if (dateStr >= range.start && dateStr <= range.end && blockWeekdays.has(date.getDay())) return true;
          }
          const vegasToday = bookingZoneTodayStr();
          if (dateStr < vegasToday) return true;
          // Any calendar day with zero bookable slots (past times, or after ~3pm for last 4pm slot + 1hr rule)
          if (!dayHasAnyBookableSlot(dateStr)) return true;
          return false;
        } catch (err) {
          console.warn('Date disable check failed:', err);
          return true;
        }
      },
    ],
    onChange: function (selectedDates, dateStr) {
      const ds = flatpickrDateStr(selectedDates, dateStr);
      updateTimeSlots(ds || '');
    },
    onClose: function (selectedDates, dateStr) {
      const ds = flatpickrDateStr(selectedDates, dateStr);
      updateTimeSlots(ds || '');
    },
    onOpen: function () {
      syncFlatpickrMinDateToBookingZone();
      try {
        flatpickrInstance.redraw();
      } catch (_) {}
      clearSelectionIfDayFullyClosed();
    },
    onMonthChange: function () {
      try {
        flatpickrInstance.redraw();
      } catch (_) {}
    },
    onYearChange: function () {
      try {
        flatpickrInstance.redraw();
      } catch (_) {}
    },
    onReady: function (selectedDates, dateStr) {
      syncFlatpickrMinDateToBookingZone();
      const ds = flatpickrDateStr(selectedDates, dateStr);
      updateTimeSlots(ds || '');
    },
  });

  // If flatpickr hooks miss (some browsers), sync when the date field value changes
  dateInput.addEventListener('change', () => {
    const v = normalizeDateStr(dateInput.value);
    if (v) updateTimeSlots(v);
  });
  dateInput.addEventListener('input', () => {
    const v = normalizeDateStr(dateInput.value);
    if (v) updateTimeSlots(v);
  });

  // Refresh times + calendar disable state (e.g. crossing 3:01pm closes same-day booking)
  setInterval(() => {
    if (!flatpickrInstance) return;
    syncFlatpickrMinDateToBookingZone();
    const el = document.getElementById('date');
    const raw = flatpickrInstance.input.value || el?.value;
    const ds = normalizeDateStr(raw);
    if (ds) updateTimeSlots(ds);
    clearSelectionIfDayFullyClosed();
    try {
      flatpickrInstance.redraw();
    } catch (_) {}
  }, 30000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    syncFlatpickrMinDateToBookingZone();
    const raw = flatpickrInstance?.input?.value || dateInput.value;
    const ds = normalizeDateStr(raw);
    if (ds) updateTimeSlots(ds);
    clearSelectionIfDayFullyClosed();
    try {
      flatpickrInstance?.redraw();
    } catch (_) {}
  });
}

/** YYYY-MM-DD in local timezone */
function calendarDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Flatpickr / input may return 2026-3-19 vs 2026-03-19 — must match for "is today" */
function normalizeDateStr(str) {
  if (!str || typeof str !== 'string') return '';
  const m = str.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return str.trim();
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/** At least one slot on this calendar date is still bookable (>=1 hr from now, Vegas-local times) */
function dayHasAnyBookableSlot(dateStr) {
  const norm = normalizeDateStr(dateStr);
  return BOOKING_TIME_SLOTS.some((t) => slotHasOneHourLead(norm, t));
}

/** True if slot starts at least 1 hour from now (any date — past slots fail automatically) */
function slotHasOneHourLead(dateStr, timeLabel) {
  const slot = parseSlotDateTime(dateStr, timeLabel);
  if (Number.isNaN(slot.getTime())) return false;
  return slot.getTime() - Date.now() >= 60 * 60 * 1000;
}

// Fetch booked slots; disable past slots and slots <1 hr away (last slot 4pm → same-day closes after ~3pm)
async function updateTimeSlots(dateStr) {
  const timeSelect = document.getElementById('time');
  if (!timeSelect) return;
  if (!dateStr) {
    updateTimeSlotsSeq++;
    timeSelect.innerHTML = '<option value="">Select a date first</option>';
    return;
  }

  dateStr = normalizeDateStr(dateStr);
  if (!dateStr) {
    updateTimeSlotsSeq++;
    timeSelect.innerHTML = '<option value="">Select a date first</option>';
    return;
  }

  // Keep selection when the same date is refreshed (30s timer, visibility, autofill) — rebuild would clear it otherwise.
  const preservedTime = (timeSelect.value || '').trim();

  const requestId = ++updateTimeSlotsSeq;
  const allSlots = BOOKING_TIME_SLOTS;

  let booked = [];
  if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
    try {
      const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      const { data } = await supabaseClient
        .from('bookings')
        .select('time')
        .eq('date', dateStr);
      booked = (data || []).map((b) => b.time);
    } catch (err) {
      console.warn('Supabase not configured or error:', err);
    }
  }

  if (requestId !== updateTimeSlotsSeq) return;

  timeSelect.innerHTML = '<option value="">Select a time</option>';
  let anyEnabled = false;

  allSlots.forEach((t) => {
    const taken = booked.includes(t);
    const slotOk = slotHasOneHourLead(dateStr, t);
    const unavailable = taken || !slotOk;
    if (!unavailable) anyEnabled = true;

    const slotMs = parseSlotDateTime(dateStr, t).getTime();
    const inPast = !Number.isNaN(slotMs) && slotMs < Date.now();

    const opt = document.createElement('option');
    opt.value = t;
    let label = t;
    if (taken) label = `${t} — Booked`;
    else if (!slotOk) label = inPast ? `${t} — Past` : `${t} — Need 1 hr notice`;
    opt.textContent = label;
    opt.disabled = unavailable;
    timeSelect.appendChild(opt);
  });

  if (!anyEnabled) {
    timeSelect.innerHTML = '<option value="">No times available — choose another date</option>';
    return;
  }

  if (preservedTime) {
    const stillOk = Array.from(timeSelect.options).some(
      (o) => o.value === preservedTime && !o.disabled
    );
    if (stillOk) timeSelect.value = preservedTime;
  }
}

function initTravelNotes() {
  const travelSelect = document.getElementById('travel');
  const notesField = document.getElementById('notes');
  if (!travelSelect || !notesField) return;

  const travelPrefix = 'Travel requested — please include your location/address. ';

  travelSelect.addEventListener('change', () => {
    const notes = notesField.value;
    if (travelSelect.value === 'Yes') {
      if (!notes.startsWith(travelPrefix)) {
        notesField.value = travelPrefix + notes.replace(travelPrefix, '').trim();
      }
    } else {
      notesField.value = notes.replace(travelPrefix, '').trim();
    }
  });
}

// Booking form — contact validation (reduces fake / mistyped email & phone)
const BOOKING_DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  'guerrillamail.com',
  'yopmail.com',
  '10minutemail.com',
  'trashmail.com',
  'maildrop.cc',
  'sharklasers.com',
  'getnada.com',
  'mohmal.com',
  'fakeinbox.com',
  'dispostable.com',
  'throwaway.email',
  'temp-mail.io',
  'emailondeck.com',
]);

function normalizeUsPhoneDigits(input) {
  const d = String(input || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) return d.slice(1);
  if (d.length === 10) return d;
  return null;
}

function validateUsPhoneNanp(digits) {
  if (!digits || digits.length !== 10) return false;
  if (new Set(digits).size === 1) return false;
  if (digits[0] === '0' || digits[0] === '1') return false;
  if (digits[3] === '0' || digits[3] === '1') return false;
  return true;
}

function formatUsPhonePretty(digits) {
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function validateBookingEmail(raw) {
  const email = String(raw || '')
    .trim()
    .toLowerCase();
  if (!email || email.length > 254) return { ok: false, message: 'Enter a valid email address.' };
  const at = email.indexOf('@');
  if (at < 1) return { ok: false, message: 'Enter a valid email address.' };
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain || domain.includes('..') || domain.startsWith('.') || domain.endsWith('.')) {
    return { ok: false, message: 'Enter a valid email address.' };
  }
  const labels = domain.split('.');
  if (labels.length < 2) {
    return { ok: false, message: 'Use an email with a real domain (e.g. gmail.com).' };
  }
  const tld = labels[labels.length - 1];
  if (tld.length < 2 || !/^[a-z]+$/i.test(tld)) {
    return { ok: false, message: 'Use a real email address (the part after @ needs a normal domain).' };
  }
  if (labels.length === 2 && /^[0-9]+$/.test(labels[0])) {
    return {
      ok: false,
      message: 'That email doesn’t look valid. Use a real provider (Gmail, iCloud, Yahoo, etc.).',
    };
  }
  if (BOOKING_DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return { ok: false, message: 'Please use a personal or work email, not a temporary inbox.' };
  }
  if (/^example\.(com|org|net)$/i.test(domain) || domain === 'localhost') {
    return { ok: false, message: 'Enter a real email you check regularly.' };
  }
  if (!/^[a-z0-9._%+\-]+$/i.test(local) || local.length > 64) {
    return { ok: false, message: 'Enter a valid email address.' };
  }
  return { ok: true, email };
}

function validateBookingName(raw) {
  const name = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120) {
    return { ok: false, message: 'Please enter your full name.' };
  }
  const letters = name.replace(/[^a-zA-Z\u00C0-\u024F]/g, '');
  if (letters.length < 2) {
    return { ok: false, message: 'Please enter a real name (letters).' };
  }
  return { ok: true, name };
}

function validateBookingContactFields({ name, email, emailConfirm, phone }) {
  const n = validateBookingName(name);
  if (!n.ok) return n;
  const e = validateBookingEmail(email);
  if (!e.ok) return e;
  const confirmTrim = String(emailConfirm ?? '')
    .trim()
    .toLowerCase();
  if (confirmTrim !== e.email) {
    return { ok: false, message: 'Email and “Confirm email” must match.' };
  }
  const digits = normalizeUsPhoneDigits(phone);
  if (!digits) {
    return { ok: false, message: 'Enter a valid U.S. phone number (10 digits, or 11 starting with 1).' };
  }
  if (!validateUsPhoneNanp(digits)) {
    return {
      ok: false,
      message: 'That U.S. phone number doesn’t look valid. Check the area code and number.',
    };
  }
  return {
    ok: true,
    email: e.email,
    phoneFormatted: formatUsPhonePretty(digits),
    nameDisplay: n.name,
  };
}

const BOOKING_CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomBookingCaptchaString(len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += BOOKING_CAPTCHA_CHARS[Math.floor(Math.random() * BOOKING_CAPTCHA_CHARS.length)];
  }
  return s;
}

function drawBookingCaptchaCanvas(canvas, text) {
  if (!canvas || !canvas.getContext || !text) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#121212';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = `rgba(201, 169, 98, ${0.08 + Math.random() * 0.12})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.random() * w, Math.random() * h);
    ctx.lineTo(Math.random() * w, Math.random() * h);
    ctx.stroke();
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(200, 190, 170, ${0.05 + Math.random() * 0.08})`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 1.5 + 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const fontSize = 26;
  ctx.font = `bold ${fontSize}px Montserrat, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  for (let i = 0; i < text.length; i++) {
    ctx.save();
    const x = 18 + i * 34;
    const y = h / 2 + (Math.random() - 0.5) * 10;
    ctx.translate(x, y);
    ctx.rotate((Math.random() - 0.5) * 0.55);
    ctx.fillStyle = `rgba(230, 210, 170, ${0.75 + Math.random() * 0.25})`;
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
}

// Booking form submit
/** Public IP as seen by Netlify; empty if unavailable (e.g. static file open, or function cold). */
async function fetchClientIpForBooking() {
  try {
    const res = await fetch('/.netlify/functions/client-ip', {
      method: 'GET',
      credentials: 'same-origin',
    });
    if (!res.ok) return '';
    const data = await res.json();
    const ip = typeof data.ip === 'string' ? data.ip.trim() : '';
    if (!ip || ip.length > 45) return '';
    if (!/^[\d.a-fA-F:]+$/i.test(ip)) return '';
    return ip;
  } catch {
    return '';
  }
}

/** Twilio Lookup (server-side): real / routable number — no SMS code. */
async function verifyPhoneWithTwilioLookup(phoneFormatted) {
  const digits = normalizeUsPhoneDigits(phoneFormatted);
  if (!digits) {
    return { ok: false, message: 'Enter a valid U.S. phone number.' };
  }
  const e164 = `+1${digits}`;
  try {
    const res = await fetch('/.netlify/functions/lookup-phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ phone: e164 }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok === true) {
      return { ok: true };
    }
    if (typeof data.message === 'string' && data.message.trim()) {
      return { ok: false, message: data.message.trim() };
    }
    return {
      ok: false,
      message: 'Could not verify phone. Please try again.',
    };
  } catch (err) {
    console.warn('[Blendz] lookup-phone:', err);
    return {
      ok: false,
      message: 'Could not verify phone. Please use the live booking page or try again.',
    };
  }
}

function initBookingForm() {
  const form = document.getElementById('booking-form');
  const status = document.getElementById('booking-status');
  if (!form || !status) return;

  const emailConfirm = document.getElementById('email-confirm');
  if (emailConfirm?.hasAttribute('readonly')) {
    emailConfirm.addEventListener(
      'focusin',
      () => {
        emailConfirm.removeAttribute('readonly');
      },
      { once: true },
    );
  }

  let bookingCaptchaExpected = '';

  function refreshBookingCaptcha() {
    bookingCaptchaExpected = randomBookingCaptchaString(5);
    const canvas = document.getElementById('booking-captcha-canvas');
    drawBookingCaptchaCanvas(canvas, bookingCaptchaExpected);
    const input = document.getElementById('booking-captcha-input');
    if (input) input.value = '';
  }

  document.getElementById('booking-captcha-refresh')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    refreshBookingCaptcha();
  });

  if (document.getElementById('booking-captcha-canvas')) {
    refreshBookingCaptcha();
  }

  // On mobile: scroll to first invalid field and highlight when validation fails
  let firstInvalidHandled = false;
  form.addEventListener('invalid', (e) => {
    if (!firstInvalidHandled) {
      firstInvalidHandled = true;
      const formRow = e.target.closest('.form-row');
      setTimeout(() => {
        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (formRow) {
          formRow.classList.add('highlight-service');
          setTimeout(() => formRow.classList.remove('highlight-service'), 2000);
        }
      }, 100);
    }
  }, true);
  form.querySelector('button[type="submit"]')?.addEventListener('click', () => {
    firstInvalidHandled = false;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const contact = validateBookingContactFields({
      name: form.name.value,
      email: form.email.value,
      emailConfirm: document.getElementById('email-confirm')?.value ?? form.email.value,
      phone: form.phone.value,
    });
    if (!contact.ok) {
      status.className = 'booking-status error';
      status.textContent = contact.message;
      status.style.display = 'block';
      return;
    }

    const hp = (form.querySelector('[name="bbm_hp"]')?.value || '').trim();
    if (hp) {
      status.className = 'booking-status error';
      status.textContent = 'Unable to send this request. Please try again.';
      status.style.display = 'block';
      return;
    }

    if (document.getElementById('booking-captcha-input')) {
      const typed = (document.getElementById('booking-captcha-input').value || '')
        .trim()
        .toUpperCase()
        .replace(/\s/g, '');
      if (!typed || typed !== bookingCaptchaExpected) {
        status.className = 'booking-status error';
        status.textContent =
          'The letters didn’t match the image. Try again or tap “New code”.';
        status.style.display = 'block';
        refreshBookingCaptcha();
        return;
      }
    }

    status.className = 'booking-status loading';
    status.textContent = 'Verifying phone number…';
    status.style.display = 'block';

    const lookupResult = await verifyPhoneWithTwilioLookup(contact.phoneFormatted);
    if (!lookupResult.ok) {
      status.className = 'booking-status error';
      status.textContent = lookupResult.message;
      status.style.display = 'block';
      return;
    }

    let notes = form.notes.value || '';
    if (form.travel?.value === 'Yes') {
      notes = 'Travel requested. ' + notes;
    }

    const payload = {
      service: form.service.value,
      date: form.date.value,
      time: form.time.value,
      name: contact.nameDisplay,
      email: contact.email,
      phone: contact.phoneFormatted,
      travel: form.travel?.value || 'No',
      notes,
      sms_consent: document.getElementById('sms-consent')?.checked === true,
    };

    const normDate = normalizeDateStr(payload.date);
    if (
      !normDate ||
      !dayHasAnyBookableSlot(normDate) ||
      !payload.time ||
      !slotHasOneHourLead(normDate, payload.time)
    ) {
      status.className = 'booking-status error';
      status.textContent =
        'That date or time is no longer available. Please pick another slot (1 hour notice; last booking 4pm).';
      status.style.display = 'block';
      if (flatpickrInstance) {
        try {
          flatpickrInstance.redraw();
        } catch (_) {}
      }
      updateTimeSlots(normDate || '');
      return;
    }

    status.className = 'booking-status loading';
    status.textContent = 'Submitting...';
    status.style.display = 'block';

    const hasSupabase = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY;
    const hasFormspree = CONFIG.FORMSPREE_BOOKING_ID;

    if (!hasSupabase && !hasFormspree) {
      status.className = 'booking-status error';
      status.textContent = 'Booking is not yet configured. Please email BlendzByMora@gmail.com to book.';
      status.style.display = 'block';
      return;
    }

    try {
      const clientIp = await fetchClientIpForBooking();
      const bookingPayload = {
        ...payload,
        ...(clientIp ? { client_ip: clientIp } : {}),
      };

      // 1. Save to Supabase (prevents double booking)
      if (hasSupabase) {
        const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        const { data: inserted, error } = await supabaseClient
          .from('bookings')
          .insert([bookingPayload])
          .select('id')
          .single();
        if (error) {
          const em = String(error.message || '');
          if (em.includes('BLOCKED_IP')) {
            status.className = 'booking-status error';
            status.textContent =
              'This request could not be submitted. Please email BlendzByMora@gmail.com to book.';
            status.style.display = 'block';
            return;
          }
          if (em.includes('RATE_LIMIT')) {
            status.className = 'booking-status error';
            status.textContent =
              'Too many booking requests from this network or number. Please wait 24 hours or email BlendzByMora@gmail.com.';
            status.style.display = 'block';
            return;
          }
          throw error;
        }
        const newId = inserted?.id != null ? String(inserted.id).trim() : '';
        if (newId) {
          fetch('/.netlify/functions/booking-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ bookingId: newId }),
          })
            .then(async (r) => {
              if (!r.ok) {
                const txt = await r.text().catch(() => '');
                console.warn('[Blendz] SMS confirmation failed:', r.status, txt);
              }
            })
            .catch((err) => console.warn('[Blendz] SMS request error:', err));
        } else {
          console.warn(
            '[Blendz] No booking id returned after insert — SMS skipped. Check Supabase RLS allows SELECT on bookings for anon (needed for .select("id") after insert).'
          );
        }
      }

      // 2. Send to Formspree (email to you + CC copy to customer — same details as your notification)
      if (hasFormspree) {
        const formData = new FormData();
        const firstName = (bookingPayload.name || '').trim().split(/\s+/)[0] || 'there';
        const confirmationCopy =
          `Hello ${firstName},\n\n` +
          'Thank you for submitting an appointment request with Blendz By Mora. Below is a copy of the services you requested for your records.\n\n' +
          'Our team will review your request and follow up shortly to confirm your appointment by email or phone.\n\n' +
          'Kind regards,\nBlendz By Mora';
        // Shown first in Formspree emails (you + customer CC) — reads as a professional cover note above the fields
        formData.append('Appointment confirmation', confirmationCopy);
        Object.entries(bookingPayload).forEach(([k, v]) => formData.append(k, v));
        formData.append(
          '_subject',
          `Blendz By Mora — appointment request received (${bookingPayload.date} · ${bookingPayload.time})`
        );
        if (bookingPayload.email && bookingPayload.email.trim()) {
          formData.append('_cc', bookingPayload.email.trim());
        }
        const res = await fetch(`https://formspree.io/f/${CONFIG.FORMSPREE_BOOKING_ID}`, {
          method: 'POST',
          body: formData,
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error('Formspree failed');
      }

      status.className = 'booking-status success';
      status.textContent = 'Your appointment request has been submitted! We\'ll confirm via email or phone.';
      form.reset();
      if (flatpickrInstance) flatpickrInstance.clear();
      if (document.getElementById('booking-captcha-canvas')) {
        refreshBookingCaptcha();
      }
    } catch (err) {
      status.className = 'booking-status error';
      status.textContent = 'Something went wrong. Please email BlendzByMora@gmail.com to book.';
      console.error(err);
    }
  });
}

const MAX_REVIEW_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_REVIEW_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function uploadReviewPhotoToStorage(client, file) {
  if (file.size > MAX_REVIEW_PHOTO_BYTES) {
    throw new Error('Photo must be 5 MB or smaller.');
  }
  if (!ALLOWED_REVIEW_PHOTO_TYPES.includes(file.type)) {
    throw new Error('Please use a JPG, PNG, or WebP image.');
  }
  const rawExt = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt || 'jpg';
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `reviews/${id}.${ext}`;
  const { error } = await client.storage.from('review-images').upload(path, file, {
    contentType: file.type,
    cacheControl: '86400',
    upsert: false,
  });
  if (error) throw error;
  const { data } = client.storage.from('review-images').getPublicUrl(path);
  return data?.publicUrl || null;
}

function safeReviewImageUrl(url) {
  const s = String(url || '').trim();
  if (!s.startsWith('https://') && !s.startsWith('http://')) return '';
  return s;
}

// Review form
function initReviewForm() {
  const form = document.getElementById('review-form');
  if (!form) return;

  const photoInput = form.querySelector('#review-photo');
  const fileNameEl = document.getElementById('review-file-name');
  if (photoInput && fileNameEl) {
    photoInput.addEventListener('change', () => {
      const f = photoInput.files?.[0];
      fileNameEl.textContent = f ? f.name : '';
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const hasSupabase = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY;
    const hasFormspree = CONFIG.FORMSPREE_REVIEW_ID;

    if (!hasSupabase && !hasFormspree) {
      alert('Reviews are not yet configured. You can leave a review on Yelp or Google!');
      return;
    }

    try {
      const payload = {
        name: form.querySelector('#review-name').value,
        service: form.querySelector('#review-service').value,
        rating: form.querySelector('#review-rating').value,
        review: form.querySelector('#review-text').value,
      };

      let imageUrl = null;
      if (hasSupabase) {
        const client = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        if (photoInput?.files?.[0]) {
          try {
            imageUrl = await uploadReviewPhotoToStorage(client, photoInput.files[0]);
          } catch (upErr) {
            console.warn(upErr);
            const raw =
              upErr?.message ||
              upErr?.error ||
              (typeof upErr === 'string' ? upErr : '') ||
              'Could not upload photo.';
            const bucketHint =
              /bucket/i.test(raw) || /not found/i.test(raw)
                ? '\n\nCreate the bucket: Supabase → Storage → New bucket → name exactly review-images → enable Public. Then in SQL Editor, run the two policies for review-images from SETUP_SUPABASE.md (anon INSERT + SELECT on storage.objects).'
                : '';
            const saveWithoutPhoto = window.confirm(
              `${raw}${bucketHint}\n\nOK = save your review without a photo.\nCancel = stay here and fix Storage, then try again.`
            );
            if (!saveWithoutPhoto) return;
          }
        }
        if (imageUrl) payload.image_url = imageUrl;
        const { error } = await client.from('reviews').insert([payload]);
        if (error) throw error;
      }

      if (hasFormspree) {
        const formData = new FormData();
        Object.entries(payload).forEach(([k, v]) => {
          if (v != null && v !== '') formData.append(k, v);
        });
        if (photoInput?.files?.[0]) {
          formData.append('photo', photoInput.files[0]);
        }
        await fetch(`https://formspree.io/f/${CONFIG.FORMSPREE_REVIEW_ID}`, {
          method: 'POST',
          body: formData,
          headers: { Accept: 'application/json' },
        });
      }

      alert('Thank you for your review!');
      form.reset();
      if (fileNameEl) fileNameEl.textContent = '';
      loadReviews();
    } catch (err) {
      alert('Could not submit. You can also leave a review on Yelp or Google!');
    }
  });
}

// Reviews carousel state
let reviewsData = [];
let currentReviewIndex = 0;
let reviewsAutoTimer = null;
/** Auto-advance interval (ms) — slow rotation similar to story-style UIs */
const REVIEWS_AUTO_MS = 11000;

function reviewsReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

function clearReviewsAutoAdvance() {
  if (reviewsAutoTimer) {
    clearTimeout(reviewsAutoTimer);
    reviewsAutoTimer = null;
  }
}

function scheduleReviewsAutoAdvance() {
  clearReviewsAutoAdvance();
  if (reviewsData.length <= 1 || reviewsReducedMotion()) return;
  if (typeof document !== 'undefined' && document.hidden) return;
  const carousel = document.querySelector('.reviews-carousel');
  if (carousel?.dataset.userHover === '1') return;

  reviewsAutoTimer = setTimeout(() => {
    reviewsAutoTimer = null;
    currentReviewIndex = (currentReviewIndex + 1) % reviewsData.length;
    renderReviewCarousel();
    renderReviewDots();
    scheduleReviewsAutoAdvance();
  }, REVIEWS_AUTO_MS);
}

function restartReviewsAutoAdvance() {
  scheduleReviewsAutoAdvance();
}

function attachReviewsCarouselPauseHooks() {
  const carousel = document.querySelector('.reviews-carousel');
  if (!carousel || carousel.dataset.pauseHooks === '1') return;
  carousel.dataset.pauseHooks = '1';
  carousel.addEventListener('mouseenter', () => {
    carousel.dataset.userHover = '1';
    clearReviewsAutoAdvance();
  });
  carousel.addEventListener('mouseleave', () => {
    delete carousel.dataset.userHover;
    scheduleReviewsAutoAdvance();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearReviewsAutoAdvance();
    else if (carousel.dataset.userHover !== '1') scheduleReviewsAutoAdvance();
  });
}

// Load and display reviews
async function loadReviews() {
  const list = document.getElementById('reviews-list');
  const dotsContainer = document.getElementById('reviews-dots');
  if (!list) return;

  try {
    if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
      try {
        const client = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        const { data } = await client.from('reviews').select('*').order('created_at', { ascending: true }).limit(50);
        if (data && data.length) {
          reviewsData = data;
          currentReviewIndex = 0;
          renderReviewCarousel();
          initReviewCarousel();
          renderReviewDots();
          attachReviewsCarouselPauseHooks();
          restartReviewsAutoAdvance();
          return;
        }
      } catch (err) {
        console.warn('Reviews not loaded:', err);
      }
    }

    reviewsData = [];
    clearReviewsAutoAdvance();
    list.innerHTML = '<p class="review-item-text" style="text-align:center;color:var(--color-text-muted);padding:2rem">No reviews yet. Be the first to leave one!</p>';
    if (dotsContainer) dotsContainer.innerHTML = '';
  } finally {
    // Cross-page links (e.g. faq → index#contact) scroll before reviews render; re-align once carousel/placeholder DOM exists
    alignScrollToHashTarget('auto');
  }
}

function renderReviewCarousel() {
  const list = document.getElementById('reviews-list');
  const dotsContainer = document.getElementById('reviews-dots');
  if (!list || !reviewsData.length) return;

  const r = reviewsData[currentReviewIndex];
  const imgSrc = safeReviewImageUrl(r.image_url);
  const photoBlock = imgSrc
    ? `<div class="review-item-image"><img class="review-item-img" src="${escapeAttr(imgSrc)}" alt="" loading="lazy" decoding="async"></div>`
    : '';

  const serviceLine =
    r.service && String(r.service).trim()
      ? `<div class="review-item-service">${escapeHtml(String(r.service).trim())}</div>`
      : '';

  list.innerHTML = `
    <div class="review-item review-item-allure${imgSrc ? ' review-item-allure--has-photo' : ''}">
      ${photoBlock}
      <div class="review-item-name">${escapeHtml(r.name)}</div>
      ${serviceLine}
      <div class="review-item-rating">${'★'.repeat(Number(r.rating))}${'☆'.repeat(5 - Number(r.rating))}</div>
      <p class="review-item-text">${escapeHtml(r.review)}</p>
    </div>
  `;

  if (reviewsData.length > 1 && dotsContainer) renderReviewDots();
  const prevBtn = document.querySelector('.carousel-prev');
  const nextBtn = document.querySelector('.carousel-next');
  if (prevBtn) {
    prevBtn.disabled = false;
    prevBtn.style.opacity = '1';
  }
  if (nextBtn) {
    nextBtn.disabled = false;
    nextBtn.style.opacity = '1';
  }
}

function renderReviewDots() {
  const dotsContainer = document.getElementById('reviews-dots');
  if (!dotsContainer || reviewsData.length <= 1) return;
  dotsContainer.innerHTML = reviewsData.map((_, i) =>
    `<button type="button" class="review-dot ${i === currentReviewIndex ? 'active' : ''}" data-index="${i}" aria-label="Go to review ${i + 1}"></button>`
  ).join('');
  dotsContainer.querySelectorAll('.review-dot').forEach((btn) => {
    btn.onclick = () => {
      currentReviewIndex = parseInt(btn.dataset.index, 10);
      renderReviewCarousel();
      renderReviewDots();
      restartReviewsAutoAdvance();
    };
  });
}

function initReviewCarousel() {
  const prevBtn = document.querySelector('.carousel-prev');
  const nextBtn = document.querySelector('.carousel-next');

  if (reviewsData.length <= 1) {
    clearReviewsAutoAdvance();
    if (prevBtn) prevBtn.style.visibility = 'hidden';
    if (nextBtn) nextBtn.style.visibility = 'hidden';
    return;
  }
  if (prevBtn) prevBtn.style.visibility = 'visible';
  if (nextBtn) nextBtn.style.visibility = 'visible';

  const len = reviewsData.length;
  const go = () => {
    renderReviewCarousel();
    renderReviewDots();
    restartReviewsAutoAdvance();
  };

  if (prevBtn)
    prevBtn.onclick = () => {
      currentReviewIndex = (currentReviewIndex - 1 + len) % len;
      go();
    };
  if (nextBtn)
    nextBtn.onclick = () => {
      currentReviewIndex = (currentReviewIndex + 1) % len;
      go();
    };
  restartReviewsAutoAdvance();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;');
}
