// -----------------------------------------------------------------------------
// Scenes: the "new event matching my watched words" trigger, and the "outings
// summary" action (a ready-to-send text, e.g. on Friday at 18:00).
//
// The trigger is fired by the container for each new event matching a
// watched word of the configuration; the core then compares the filters of
// each scene (equality and membership only) with the event's values.
// -----------------------------------------------------------------------------

import { PERIODS, parseFilters, periodWindow, selectEvents } from './filters.js';
import { PERIOD_LABELS, TEXT, THEME_LABELS, formatWhen, pick } from './i18n.js';
import { truncate } from './text.js';

export const TRIGGERS = { NEW_EVENT: 'new_event' };
export const SCENE_TRIGGER_KEYS = Object.values(TRIGGERS);
export const SCENE_ACTION_KEYS = { OUTINGS_SUMMARY: 'outings_summary' };

/** Values of the trigger's "Free" filter. */
export const FREE_CHOICES = ['yes', 'no'];

export const SUMMARY_DEFAULTS = Object.freeze({ period: 'weekend', max_items: 5 });
export const SUMMARY_MAX_ITEMS = 15;

/**
 * The data of a "new event" scene event: the filter values (keyword, main
 * theme, free, town) and the variables a scene can send.
 * @param {{ event: object, keyword: string }} entry
 */
export function newEventData({ event, keyword }, language, now) {
  const [start, end] = event.occurrences[0];
  const theme = event.themes[0] ?? null;
  return {
    keyword,
    theme,
    free: event.free ? 'yes' : 'no',
    city: event.city || null,
    title: truncate(event.title, 200),
    theme_label: theme ? pick(THEME_LABELS, language)[theme] : null,
    date: formatWhen({ start, end, allDay: event.allDay }, language, now),
    start: new Date(start).toISOString(),
    venue: event.venue || null,
    url: event.url,
    price: event.price ? truncate(event.price, 300) : event.free ? pick(TEXT, language).free : null,
    summary: event.summary ? truncate(event.summary, 500) : null,
  };
}

/** One line of the summary: "• sam. 18 oct., 20:00 — Title · Place (Gratuit)". */
function line(selected, language, now) {
  const { event, start, end } = selected;
  const when = formatWhen({ start, end, allDay: event.allDay }, language, now);
  const place = event.venue || event.city;
  const free = event.free ? ` (${pick(TEXT, language).free})` : '';
  return `• ${when} — ${truncate(event.title, 90)}${place ? ` · ${truncate(place, 50)}` : ''}${free}`;
}

function maxItems(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || value === '' || value === null || value === undefined) {
    return SUMMARY_DEFAULTS.max_items;
  }
  return Math.min(SUMMARY_MAX_ITEMS, Math.max(1, number));
}

/**
 * The "outings summary" scene action.
 * @param {{ catalog: import('./catalog.js').Catalog, language: string, now: number }} context
 * @param {Record<string, unknown>} fields
 */
export function outingsSummary({ catalog, language, now }, fields = {}) {
  const text = pick(TEXT, language);
  const period = PERIODS.includes(fields.period) ? fields.period : SUMMARY_DEFAULTS.period;
  const periodLabel = pick(PERIOD_LABELS, language)[period];
  if (!catalog.ready) {
    return { summary: text.summaryLoading, count: 0, first_title: '', first_url: '' };
  }
  const selected = selectEvents(catalog.visible, parseFilters(fields), periodWindow(period, now));
  if (selected.length === 0) {
    return { summary: text.summaryNone(periodLabel), count: 0, first_title: '', first_url: '' };
  }
  const shown = selected.slice(0, maxItems(fields.max_items));
  const lines = [
    text.summaryTitle(periodLabel, selected.length),
    ...shown.map((entry) => line(entry, language, now)),
  ];
  if (selected.length > shown.length) {
    lines.push(text.summaryMore(selected.length - shown.length));
  }
  return {
    summary: lines.join('\n'),
    count: selected.length,
    first_title: selected[0].event.title,
    first_url: selected[0].event.url ?? '',
  };
}
