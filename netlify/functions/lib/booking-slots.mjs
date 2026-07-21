/** Shared booking slot list (matches app.js / admin). */
export const BOOKING_TIME_SLOTS = ['8:00 AM', '10:00 AM', '12:00 PM', '2:00 PM', '4:00 PM'];

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidSlotTime(time) {
  return BOOKING_TIME_SLOTS.includes(String(time || '').trim());
}

export function isValidYmd(dateStr) {
  return YMD_RE.test(String(dateStr || '').trim());
}

/** Times held by paid deposits on a calendar date (optionally ignore one booking being moved). */
export async function getBookedTimesForDate(supabase, dateStr, excludeBookingId = null) {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, time')
    .eq('date', dateStr)
    .not('deposit_paid_at', 'is', null);

  if (error) throw error;

  return (data || [])
    .filter((row) => !excludeBookingId || String(row.id) !== String(excludeBookingId))
    .map((row) => String(row.time || '').trim())
    .filter(Boolean);
}

export function slotsWithAvailability(bookedTimes) {
  const booked = new Set(bookedTimes);
  return BOOKING_TIME_SLOTS.map((time) => ({
    time,
    available: !booked.has(time),
  }));
}
