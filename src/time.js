// -----------------------------------------------------------------------------
// Time in Toulouse. The events happen in Toulouse, so "tonight", "this
// weekend" and every date shown are read in Europe/Paris, whatever the time
// zone of Gladys. Instants are milliseconds; calendar dates are 'YYYY-MM-DD'
// strings, whose arithmetic runs on UTC midnights (no 23- or 25-hour day).
// -----------------------------------------------------------------------------

export const EVENT_TIME_ZONE = 'Europe/Paris';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: EVENT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

const WEEKDAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/**
 * The calendar date, ISO weekday (1 = Monday) and time of an instant in
 * Toulouse.
 * @param {number} instant
 * @returns {{ date: string, weekday: number, hour: number, minute: number }}
 */
export function localParts(instant) {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday],
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** True for a real calendar date written 'YYYY-MM-DD' (no 2026-02-30). */
export function isDate(value) {
  const match = DATE_PATTERN.exec(value ?? '');
  if (!match) {
    return false;
  }
  return new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])).toISOString().startsWith(value);
}

/** The date `days` days after `date` (before it when negative). */
export function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The instant of a wall-clock time in Toulouse. Two passes on the offset
 * cover the daylight saving changes; a time skipped in spring lands an hour
 * later, a repeated one in autumn on its first occurrence.
 * @param {string} date 'YYYY-MM-DD'
 * @param {number} [hour]
 * @param {number} [minute]
 */
export function zonedInstant(date, hour = 0, minute = 0) {
  const wall = Date.parse(`${date}T00:00:00Z`) + hour * HOUR_MS + minute * 60_000;
  let instant = wall;
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = localParts(instant);
    const seen =
      Date.parse(`${parts.date}T00:00:00Z`) + parts.hour * HOUR_MS + parts.minute * 60_000;
    instant += wall - seen;
  }
  return instant;
}

/** Midnight in Toulouse at the start of the day of `instant`. */
export function startOfDay(instant) {
  return zonedInstant(localParts(instant).date);
}

/** Parses an ISO 8601 date-time with its offset; NaN when invalid. */
export function parseInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return Number.NaN;
  }
  return Date.parse(value);
}
