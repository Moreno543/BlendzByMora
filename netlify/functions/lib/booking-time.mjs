/**
 * Match app.js booking slot math: date + "8:00 AM" style time in BOOKING_TIMEZONE.
 * Used by booking-reminders scheduled function.
 */
export const BOOKING_TIMEZONE = 'America/Los_Angeles';

export function normalizeDateStr(str) {
  if (!str || typeof str !== 'string') return '';
  const m = str.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return str.trim();
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

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

export function parseTimeLabelToHour24Minute(timeLabel) {
  const m = String(timeLabel || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return { h, min };
}

/** Instant (UTC) when appointment slot starts */
export function parseSlotDateTime(dateStr, timeLabel, timeZone = BOOKING_TIMEZONE) {
  const norm = normalizeDateStr(dateStr);
  if (!norm) return new Date(NaN);
  const hm = parseTimeLabelToHour24Minute(timeLabel);
  if (!hm) return new Date(NaN);
  const ms = utcMsForZonedWallClock(norm, hm.h, hm.min, timeZone);
  if (Number.isNaN(ms)) return new Date(NaN);
  return new Date(ms);
}

/** YYYY-MM-DD for a UTC instant in the booking zone */
export function vegasCalendarDateStr(utcMs = Date.now(), timeZone = BOOKING_TIMEZONE) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p = {};
  fmt.formatToParts(new Date(utcMs)).forEach((x) => {
    if (x.type !== 'literal') p[x.type] = x.value;
  });
  return `${p.year}-${p.month}-${p.day}`;
}
