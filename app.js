/**
 * Blendz By Mora - Main Application
 */

document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initDatePicker();
  initBookingForm();
  initReviewForm();
  loadReviews();
  showSupabaseHintIfNeeded();
  initGoogleReviewLink();
  initBookingScrollAndHighlight();
});

function initBookingScrollAndHighlight() {
  const serviceField = document.getElementById('service');
  const bookSection = document.getElementById('book');
  if (!serviceField || !bookSection) return;

  function scrollToServiceAndHighlight() {
    bookSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      serviceField.closest('.form-row').scrollIntoView({ behavior: 'smooth', block: 'center' });
      serviceField.closest('.form-row').classList.add('highlight-service');
      setTimeout(() => serviceField.closest('.form-row').classList.remove('highlight-service'), 2000);
    }, 300);
  }

  if (window.location.hash === '#book') scrollToServiceAndHighlight();

  document.querySelectorAll('a[href="#book"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = 'book';
      scrollToServiceAndHighlight();
    });
  });

  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#book') scrollToServiceAndHighlight();
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

function showSupabaseHintIfNeeded() {
  const hint = document.getElementById('supabase-setup-hint');
  if (hint && (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY)) {
    hint.style.display = 'block';
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

// Date picker: visible calendar, Mon-Sat only, min = today
let flatpickrInstance = null;

function initDatePicker() {
  const dateInput = document.getElementById('date');
  if (!dateInput) return;

  flatpickrInstance = flatpickr(dateInput, {
    dateFormat: 'Y-m-d',
    minDate: 'today',
    disable: [
      function(date) {
        return date.getDay() === 0; // Disable Sundays
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

// Booking form submit
function initBookingForm() {
  const form = document.getElementById('booking-form');
  const status = document.getElementById('booking-status');
  if (!form || !status) return;

  // On mobile: scroll to first invalid field when validation fails
  let firstInvalidHandled = false;
  form.addEventListener('invalid', (e) => {
    if (!firstInvalidHandled) {
      firstInvalidHandled = true;
      setTimeout(() => {
        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, true);
  form.addEventListener('submit', () => { firstInvalidHandled = false; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      service: form.service.value,
      date: form.date.value,
      time: form.time.value,
      name: form.name.value,
      email: form.email.value,
      phone: form.phone.value,
      notes: form.notes.value || '',
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

    const payload = {
      name: form.querySelector('#review-name').value,
      rating: form.querySelector('#review-rating').value,
      review: form.querySelector('#review-text').value,
    };

    const hasSupabase = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY;
    const hasFormspree = CONFIG.FORMSPREE_REVIEW_ID;

    if (!hasSupabase && !hasFormspree) {
      alert('Reviews are not yet configured. You can leave a review on Yelp or Google!');
      return;
    }

    try {
      if (hasSupabase) {
        const client = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        const { error } = await client.from('reviews').insert([payload]);
        if (error) throw error;
      }

      if (hasFormspree) {
        const formData = new FormData();
        Object.entries(payload).forEach(([k, v]) => formData.append(k, v));
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
  const counter = document.getElementById('reviews-counter');
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
        return;
      }
    } catch (err) {
      console.warn('Reviews not loaded:', err);
    }
  }

  reviewsData = [];
  list.innerHTML = '<p class="review-item-text" style="text-align:center;color:var(--color-text-muted);padding:2rem">No reviews yet. Be the first to leave one!</p>';
  if (counter) counter.textContent = '';
}

function renderReviewCarousel() {
  const list = document.getElementById('reviews-list');
  const counter = document.getElementById('reviews-counter');
  if (!list || !reviewsData.length) return;

  const r = reviewsData[currentReviewIndex];
  list.innerHTML = `
    <div class="review-item">
      <div class="review-item-header">
        <span class="review-item-rating">${'★'.repeat(Number(r.rating))}${'☆'.repeat(5 - Number(r.rating))}</span>
        <span class="review-item-name">${escapeHtml(r.name)}</span>
      </div>
      <p class="review-item-text">${escapeHtml(r.review)}</p>
    </div>
  `;

  if (counter) {
    counter.textContent = reviewsData.length > 1 ? `${currentReviewIndex + 1} / ${reviewsData.length}` : '';
  }
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

  if (prevBtn) prevBtn.onclick = () => {
    currentReviewIndex = (currentReviewIndex - 1 + reviewsData.length) % reviewsData.length;
    renderReviewCarousel();
  };
  if (nextBtn) nextBtn.onclick = () => {
    currentReviewIndex = (currentReviewIndex + 1) % reviewsData.length;
    renderReviewCarousel();
  };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
