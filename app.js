/**
 * Blendz By Mora - Main Application
 */

document.addEventListener('DOMContentLoaded', () => {
  const stored = sessionStorage.getItem('booking-service');
  if (window.location.hash === '#book') {
    if (stored) {
      const sel = document.getElementById('service');
      if (sel) sel.value = stored;
      sessionStorage.removeItem('booking-service');
    } else {
      window.scrollTo(0, 0);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }
  initMobileMenu();
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
        window.location.hash = 'book';
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
        window.location.href = 'index.html#book';
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

// Nav scroll: ensure sections land at top (below fixed header) on mobile and desktop
function initNavScroll() {
  const header = document.querySelector('.header');
  const headerOffset = () => (header ? header.offsetHeight : 80);

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    const href = link.getAttribute('href');
    if (href === '#') return;
    const targetId = href.slice(1);
    if (targetId === 'book') return; // handled by initBookingScrollAndHighlight
    const target = document.getElementById(targetId);
    if (!target) return;

    link.addEventListener('click', (e) => {
      e.preventDefault();
      const nav = document.querySelector('.nav');
      if (nav) nav.classList.remove('open');

      requestAnimationFrame(() => {
        const y = target.getBoundingClientRect().top + window.scrollY - headerOffset();
        window.scrollTo({ top: y, behavior: 'smooth' });
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

// Booking form submit
function initBookingForm() {
  const form = document.getElementById('booking-form');
  const status = document.getElementById('booking-status');
  if (!form || !status) return;

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

    let notes = form.notes.value || '';
    if (form.travel?.value === 'Yes') {
      notes = 'Travel requested. ' + notes;
    }

    const payload = {
      service: form.service.value,
      date: form.date.value,
      time: form.time.value,
      name: form.name.value,
      email: form.email.value,
      phone: form.phone.value,
      travel: form.travel?.value || 'No',
      notes,
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
      // 1. Save to Supabase (prevents double booking)
      if (hasSupabase) {
        const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        const { error } = await supabaseClient.from('bookings').insert([payload]);
        if (error) throw error;
      }

      // 2. Send to Formspree (email to you + CC copy to customer — same details as your notification)
      if (hasFormspree) {
        const formData = new FormData();
        const firstName = (payload.name || '').trim().split(/\s+/)[0] || 'there';
        const confirmationCopy =
          `Hello ${firstName},\n\n` +
          'Thank you for submitting an appointment request with Blendz By Mora. Below is a copy of the services you requested for your records.\n\n' +
          'Our team will review your request and follow up shortly to confirm your appointment by email or phone.\n\n' +
          'Kind regards,\nBlendz By Mora';
        // Shown first in Formspree emails (you + customer CC) — reads as a professional cover note above the fields
        formData.append('Appointment confirmation', confirmationCopy);
        Object.entries(payload).forEach(([k, v]) => formData.append(k, v));
        formData.append(
          '_subject',
          `Blendz By Mora — appointment request received (${payload.date} · ${payload.time})`
        );
        if (payload.email && payload.email.trim()) {
          formData.append('_cc', payload.email.trim());
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
    } catch (err) {
      status.className = 'booking-status error';
      status.textContent = 'Something went wrong. Please email BlendzByMora@gmail.com to book.';
      console.error(err);
    }
  });
}

// Review form
function initReviewForm() {
  const form = document.getElementById('review-form');
  if (!form) return;

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
        rating: form.querySelector('#review-rating').value,
        review: form.querySelector('#review-text').value,
      };

      if (hasSupabase) {
        const client = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        const { error } = await client.from('reviews').insert([payload]);
        if (error) throw error;
      }

      if (hasFormspree) {
        const formData = new FormData();
        Object.entries(payload).forEach(([k, v]) => { if (v) formData.append(k, v); });
        await fetch(`https://formspree.io/f/${CONFIG.FORMSPREE_REVIEW_ID}`, {
          method: 'POST',
          body: formData,
          headers: { Accept: 'application/json' },
        });
      }

      alert('Thank you for your review!');
      form.reset();
      loadReviews();
    } catch (err) {
      alert('Could not submit. You can also leave a review on Yelp or Google!');
    }
  });
}

// Reviews carousel state
let reviewsData = [];
let currentReviewIndex = 0;

// Load and display reviews
async function loadReviews() {
  const list = document.getElementById('reviews-list');
  const dotsContainer = document.getElementById('reviews-dots');
  if (!list) return;

  if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
    try {
      const client = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      const { data } = await client.from('reviews').select('*').order('created_at', { ascending: false }).limit(50);
      if (data && data.length) {
        reviewsData = data;
        currentReviewIndex = 0;
        renderReviewCarousel();
        initReviewCarousel();
        renderReviewDots();
        return;
      }
    } catch (err) {
      console.warn('Reviews not loaded:', err);
    }
  }

  reviewsData = [];
  list.innerHTML = '<p class="review-item-text" style="text-align:center;color:var(--color-text-muted);padding:2rem">No reviews yet. Be the first to leave one!</p>';
  if (dotsContainer) dotsContainer.innerHTML = '';
}

function renderReviewCarousel() {
  const list = document.getElementById('reviews-list');
  const dotsContainer = document.getElementById('reviews-dots');
  if (!list || !reviewsData.length) return;

  const r = reviewsData[currentReviewIndex];
  const initial = escapeHtml(r.name).charAt(0).toUpperCase();

  list.innerHTML = `
    <div class="review-item review-item-allure">
      <div class="review-item-image"><div class="review-item-placeholder"><span>${initial}</span></div></div>
      <div class="review-item-name">${escapeHtml(r.name)}</div>
      <div class="review-item-rating">${'★'.repeat(Number(r.rating))}${'☆'.repeat(5 - Number(r.rating))}</div>
      <p class="review-item-text">${escapeHtml(r.review)}</p>
    </div>
  `;

  if (reviewsData.length > 1 && dotsContainer) renderReviewDots();
  const prevBtn = document.querySelector('.carousel-prev');
  const nextBtn = document.querySelector('.carousel-next');
  if (prevBtn) { prevBtn.disabled = currentReviewIndex === 0; prevBtn.style.opacity = currentReviewIndex === 0 ? '0.4' : '1'; }
  if (nextBtn) { nextBtn.disabled = currentReviewIndex === reviewsData.length - 1; nextBtn.style.opacity = currentReviewIndex === reviewsData.length - 1 ? '0.4' : '1'; }
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
    };
  });
}

function initReviewCarousel() {
  const prevBtn = document.querySelector('.carousel-prev');
  const nextBtn = document.querySelector('.carousel-next');

  if (reviewsData.length <= 1) {
    if (prevBtn) prevBtn.style.visibility = 'hidden';
    if (nextBtn) nextBtn.style.visibility = 'hidden';
    return;
  }
  if (prevBtn) prevBtn.style.visibility = 'visible';
  if (nextBtn) nextBtn.style.visibility = 'visible';

  const go = () => {
    renderReviewCarousel();
    renderReviewDots();
    updateArrowStates();
  };

  function updateArrowStates() {
    if (prevBtn) {
      prevBtn.disabled = currentReviewIndex === 0;
      prevBtn.style.opacity = currentReviewIndex === 0 ? '0.4' : '1';
    }
    if (nextBtn) {
      nextBtn.disabled = currentReviewIndex === reviewsData.length - 1;
      nextBtn.style.opacity = currentReviewIndex === reviewsData.length - 1 ? '0.4' : '1';
    }
  }

  if (prevBtn) prevBtn.onclick = () => {
    if (currentReviewIndex > 0) {
      currentReviewIndex--;
      go();
    }
  };
  if (nextBtn) nextBtn.onclick = () => {
    if (currentReviewIndex < reviewsData.length - 1) {
      currentReviewIndex++;
      go();
    }
  };
  updateArrowStates();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
