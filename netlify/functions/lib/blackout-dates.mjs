/**
 * Booking blackout rules — keep in sync with config.js (BLACKOUT_RANGE + BLACKOUT_DATES + BLACKOUT_EXCEPTIONS).
 */
export const BLACKOUT_RANGE = {
  start: '2026-05-04',
  end: '2026-11-05',
  blockWeekdays: [1, 2, 3, 4, 5],
};

export const BLACKOUT_EXCEPTIONS = ['2026-10-30'];

export const BLACKOUT_DATES = [
  '2026-04-06',
  '2026-04-07',
  '2026-04-08',
  '2026-04-09',
  '2026-04-10',
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-05-25',
  '2026-06-19',
  '2026-07-04',
  '2026-09-07',
  '2026-10-12',
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
  '2026-11-12',
  '2026-11-23',
  '2026-11-24',
  '2026-11-25',
  '2026-11-26',
  '2026-11-27',
  '2026-12-25',
  '2027-01-01',
  '2027-01-27',
  '2027-01-28',
  '2027-01-29',
  '2027-01-30',
  '2027-01-31',
  '2027-02-01',
  '2027-02-02',
  '2027-02-03',
  '2027-02-04',
  '2027-02-05',
  '2027-02-06',
  '2027-02-07',
];

/** Manual slot holds — keep in sync with config.js BLOCKED_SLOTS */
export const BLOCKED_SLOTS = [{ date: '2026-09-19', times: ['12:00 PM'], note: 'Personal booking' }];

const blackoutSet = new Set(BLACKOUT_DATES);
const exceptionSet = new Set(BLACKOUT_EXCEPTIONS);
const blockWeekdays = new Set(BLACKOUT_RANGE.blockWeekdays || []);

/** @param {string} dateStr YYYY-MM-DD */
export function isDateBlackedOut(dateStr) {
  const s = String(dateStr || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  if (exceptionSet.has(s)) return false;
  if (blackoutSet.has(s)) return true;
  const { start, end } = BLACKOUT_RANGE;
  if (start && end && blockWeekdays.size && s >= start && s <= end) {
    const [y, mo, d] = s.split('-').map(Number);
    const weekday = new Date(y, mo - 1, d).getDay();
    if (blockWeekdays.has(weekday)) return true;
  }
  return false;
}

/** @param {string} dateStr YYYY-MM-DD */
export function getBlockedTimesForDate(dateStr) {
  const s = String(dateStr || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return [];
  const times = [];
  for (const entry of BLOCKED_SLOTS) {
    if (String(entry?.date || '').trim().slice(0, 10) === s) {
      for (const t of entry.times || []) {
        const slot = String(t || '').trim();
        if (slot) times.push(slot);
      }
    }
  }
  return times;
}

export function isSlotManuallyBlocked(dateStr, timeStr) {
  const slot = String(timeStr || '').trim();
  if (!slot) return false;
  return getBlockedTimesForDate(dateStr).includes(slot);
}
