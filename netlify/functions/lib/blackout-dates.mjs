/**
 * Booking blackout rules — keep in sync with config.js (BLACKOUT_RANGE + BLACKOUT_DATES).
 */
export const BLACKOUT_RANGE = {
  start: '2026-05-04',
  end: '2026-10-28',
  blockWeekdays: [1, 2, 3, 4],
};

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
  '2026-11-11',
  '2026-11-26',
  '2026-12-25',
];

const blackoutSet = new Set(BLACKOUT_DATES);
const blockWeekdays = new Set(BLACKOUT_RANGE.blockWeekdays || []);

/** @param {string} dateStr YYYY-MM-DD */
export function isDateBlackedOut(dateStr) {
  const s = String(dateStr || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  if (blackoutSet.has(s)) return true;
  const { start, end } = BLACKOUT_RANGE;
  if (start && end && blockWeekdays.size && s >= start && s <= end) {
    const [y, mo, d] = s.split('-').map(Number);
    const weekday = new Date(y, mo - 1, d).getDay();
    if (blockWeekdays.has(weekday)) return true;
  }
  return false;
}
