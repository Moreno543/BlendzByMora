/** Las Vegas calendar helpers for admin date range (match site BOOKING_TIMEZONE). */
const TZ = 'America/Los_Angeles';

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
  const norm = dateStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!norm) return NaN;
  const y = parseInt(norm[1], 10);
  const mo = parseInt(norm[2], 10);
  const d = parseInt(norm[3], 10);
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

export function vegasTodayYmd() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = {};
  fmt.formatToParts(new Date()).forEach((x) => {
    if (x.type !== 'literal') parts[x.type] = x.value;
  });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Add n calendar days in Las Vegas (n = 0 returns ymd). */
export function addVegasDays(ymd, n) {
  let cur = ymd;
  for (let j = 0; j < n; j++) {
    const ms = utcMsForZonedWallClock(cur, 12, 0, TZ) + 86400000;
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = {};
    fmt.formatToParts(new Date(ms)).forEach((x) => {
      if (x.type !== 'literal') parts[x.type] = x.value;
    });
    cur = `${parts.year}-${parts.month}-${parts.day}`;
  }
  return cur;
}

function isFridayYmd(ymd) {
  const ms = utcMsForZonedWallClock(ymd, 12, 0, TZ);
  if (Number.isNaN(ms)) return false;
  const w = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' }).format(new Date(ms));
  return w === 'Friday';
}

/**
 * Default window: Vegas today through the coming Friday that still has the week ahead.
 * If today is Friday, end = *next* Friday (not same day) so you see the following week too.
 */
export function rangeTodayThroughNextFriday() {
  const start = vegasTodayYmd();
  if (isFridayYmd(start)) {
    return { start, end: addVegasDays(start, 7) };
  }
  for (let i = 0; i < 14; i++) {
    const candidate = addVegasDays(start, i);
    if (isFridayYmd(candidate)) {
      return { start, end: candidate };
    }
  }
  return { start, end: start };
}
