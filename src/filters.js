// -----------------------------------------------------------------------------
// What the widget and the scene action show: the events of a period (tonight,
// this weekend…) that pass the user's filters, soonest first.
// -----------------------------------------------------------------------------

import { THEMES } from './themes.js';
import { containsWords, normalize, parseList } from './text.js';
import { addDays, localParts, zonedInstant } from './time.js';

/** Period keys, stored in widget settings and scene actions: never rename. */
export const PERIODS = ['today', 'tonight', 'tomorrow', 'weekend', 'week', 'month'];

/** "Tonight" starts at 18:00 and ends at 05:00, when the club nights do. */
const EVENING_HOUR = 18;
const NIGHT_END_HOUR = 5;

/**
 * The window of a period, read in Toulouse.
 * - today: from now to midnight;
 * - tonight: from 18:00 (or now, later) to 05:00 the next morning;
 * - tomorrow: the whole next day;
 * - weekend: Friday 18:00 to Sunday midnight — the coming one from Monday to
 *   Thursday, the current one (from now) from Friday evening to Sunday;
 * - week: now and the next 6 days; month: now and the next 29 days.
 * @returns {{ from: number, to: number }}
 */
export function periodWindow(period, now) {
  const { date: today, weekday } = localParts(now);
  switch (period) {
    case 'today':
      return { from: now, to: zonedInstant(addDays(today, 1)) };
    case 'tonight':
      return {
        from: Math.max(now, zonedInstant(today, EVENING_HOUR)),
        to: zonedInstant(addDays(today, 1), NIGHT_END_HOUR),
      };
    case 'tomorrow':
      return { from: zonedInstant(addDays(today, 1)), to: zonedInstant(addDays(today, 2)) };
    case 'weekend': {
      const sunday = addDays(today, 7 - weekday);
      const friday = addDays(sunday, -2);
      return {
        from: Math.max(now, zonedInstant(friday, EVENING_HOUR)),
        to: zonedInstant(addDays(sunday, 1)),
      };
    }
    case 'month':
      return { from: now, to: zonedInstant(addDays(today, 30)) };
    case 'week':
    default:
      return { from: now, to: zonedInstant(addDays(today, 7)) };
  }
}

/**
 * Filters from widget settings or scene action fields; anything malformed is
 * read as "no filter".
 * @returns {{ themes: string[], keywords: string[], cities: string[], freeOnly: boolean, ongoing: boolean }}
 */
export function parseFilters(values = {}) {
  const themes = (Array.isArray(values.themes) ? values.themes : parseList(values.themes)).filter(
    (theme) => THEMES.includes(theme),
  );
  return {
    themes,
    keywords: parseList(values.keywords),
    cities: parseList(values.cities).map(normalize),
    freeOnly: values.free_only === true || values.free_only === 'true',
    ongoing: values.ongoing === true || values.ongoing === 'true',
  };
}

/** True when an event passes the filters (the period aside). */
export function matches(event, filters) {
  if (filters.freeOnly && !event.free) {
    return false;
  }
  if (!filters.ongoing && event.longRun) {
    return false;
  }
  if (filters.themes.length > 0 && !filters.themes.some((theme) => event.themes.includes(theme))) {
    return false;
  }
  if (filters.cities.length > 0 && !filters.cities.includes(normalize(event.city))) {
    return false;
  }
  if (
    filters.keywords.length > 0 &&
    !filters.keywords.some((keyword) => containsWords(event.search, keyword))
  ) {
    return false;
  }
  return true;
}

/**
 * The events of a window that pass the filters, each with its first date in
 * the window and how many it has there; soonest first, the long runs (when
 * asked for) after the one-off outings.
 * @param {object[]} events
 * @param {ReturnType<typeof parseFilters>} filters
 * @param {{ from: number, to: number }} window
 * @returns {{ event: object, start: number, end: number, dates: number }[]}
 */
export function selectEvents(events, filters, window) {
  const selected = [];
  for (const event of events) {
    if (!matches(event, filters)) {
      continue;
    }
    const inWindow = event.occurrences.filter(
      ([start, end]) => start < window.to && (end > window.from || start >= window.from),
    );
    if (inWindow.length === 0) {
      continue;
    }
    const [start, end] = inWindow[0];
    selected.push({ event, start, end, dates: inWindow.length });
  }
  return selected.sort(
    (a, b) =>
      Number(a.event.longRun) - Number(b.event.longRun) ||
      Math.max(a.start, window.from) - Math.max(b.start, window.from) ||
      a.event.title.localeCompare(b.event.title, 'fr'),
  );
}
