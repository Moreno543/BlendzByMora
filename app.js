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

function initDatePicker() {
  const dateInput = document.getElementById('date');
  if (!dateInput) return;

  const blackoutSet = new Set(CONFIG.BLACKOUT_DATES || []);
  const range = CONFIG.BLACKOUT_RANGE;
  const blockWeekdays = new Set(range?.blockWeekdays || []);

  flatpickrInstance = flatpickr(dateInput, {
    dateFormat: 'Y-m-d',
    minDate: 'today',
    disable: [
      function(date) {
        const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        if (blackoutSet.has(dateStr)) return true;
        if (range?.start && range?.end && blockWeekdays.size) {
          if (dateStr >= range.start && dateStr <= range.end && blockWeekdays.has(date.getDay())) return true;
        }
        return false;
      }
    ],
    onChange: function(selectedDates, dateStr) {
      if (dateStr) updateTimeSlots(dateStr);
    }
  });
}

// Fetch booked slots and update time dropdown
async function updateTimeSlots(dateStr) {
  const timeSelect = document.getElementById('time');
  if (!timeSelect || !dateStr) return;

  const allSlots = ['8:00 AM', '10:00 AM', '12:00 PM', '2:00 PM', '4:00 PM'];

  if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
    try {
      const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      const { data } = await supabaseClient
        .from('bookings')
        .select('time')
        .eq('date', dateStr);

      const booked = (data || []).map((b) => b.time);

      timeSelect.innerHTML = '<option value="">Select a time</option>';
      allSlots.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = booked.includes(t) ? t + ' — Booked' : t;
        opt.disabled = booked.includes(t);
        timeSelect.appendChild(opt);
      });

      if (booked.length === allSlots.length) {
        timeSelect.innerHTML = '<option value="">No slots available this day</option>';
      }
    } catch (err) {
      console.warn('Supabase not configured or error:', err);
      populateAllSlots(timeSelect, allSlots);
    }
  } else {
    populateAllSlots(timeSelect, allSlots);
  }
}

function populateAllSlots(select, slots) {
  select.innerHTML = '<option value="">Select a time</option>';
  slots.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
  });
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

      // 2. Send to Formspree (email notification)
      if (hasFormspree) {
        const formData = new FormData();
        Object.entries(payload).forEach(([k, v]) => formData.append(k, v));
        formData.append('_subject', `New Booking: ${payload.service} on ${payload.date} at ${payload.time}`);
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
