// -----------------------------------------------------------------------------
// The "Outings in Toulouse" widget: the events of a period (tonight, this
// weekend…) that pass the filters set in the widget, as a list with
// thumbnails; a tap opens the details (summary, place, price, link).
//
// Budget of the core: one caption, one card-list of 8 rows at most, and one
// body text only when there is something to explain (loading, nothing
// found, download failing).
// -----------------------------------------------------------------------------

import { PERIODS, parseFilters, periodWindow, selectEvents } from './filters.js';
import { PERIOD_LABELS, TEXT, THEME_LABELS, formatDate, formatWhen, pick } from './i18n.js';
import { imageKey } from './catalog.js';
import { truncate } from './text.js';

export const OUTINGS_WIDGET = 'outings';
export const DEFAULT_PERIOD = 'weekend';
/** Rows of a `list` card-list: the core's cap. */
export const MAX_ROWS = 8;
/** The dates are relative ("tomorrow"): re-pulled every quarter of an hour. */
const TTL_SECONDS = 900;

/** The subtitle of a row: when, then where. */
function subtitle(selected, language, now) {
  const { event, start, end, dates } = selected;
  const when = formatWhen({ start, end, allDay: event.allDay }, language, now);
  const more = dates > 1 ? ` (${pick(TEXT, language).more(dates - 1)})` : '';
  return truncate([`${when}${more}`, event.venue || event.city].filter(Boolean).join(' · '), 60);
}

function badge(event, language) {
  const text = pick(TEXT, language);
  if (event.full) {
    return { text: text.full, color: 'warning' };
  }
  if (event.free) {
    return { text: text.free, color: 'success' };
  }
  const theme = event.themes[0];
  return theme ? { text: pick(THEME_LABELS, language)[theme], color: 'neutral' } : undefined;
}

function description(selected, language, now, fetchedAt) {
  const text = pick(TEXT, language);
  const { event, start, end } = selected;
  const place = [event.venue, event.address || event.city].filter(Boolean).join(', ');
  const blocks = [
    [event.summary],
    [
      text.dates(formatWhen({ start, end, allDay: event.allDay }, language, now)),
      place && text.place(place),
      event.price && text.price(event.price),
    ],
    [text.source(formatDate(fetchedAt, language))],
  ];
  return truncate(
    blocks
      .map((lines) => lines.filter(Boolean).join('\n'))
      .filter(Boolean)
      .join('\n\n'),
    2000,
  );
}

function item(selected, language, now, fetchedAt) {
  const { event } = selected;
  const row = {
    title: truncate(event.title, 60),
    subtitle: subtitle(selected, language, now),
    description: description(selected, language, now, fetchedAt),
  };
  if (event.thumbnail) {
    row.image = imageKey(event.thumbnail);
  }
  const mark = badge(event, language);
  if (mark) {
    row.badge = mark;
  }
  if (event.url) {
    row.links = [{ url: event.url, label: pick(TEXT, language).eventPage }];
  }
  return row;
}

/**
 * @param {import('./catalog.js').Catalog} catalog
 * @param {{ settings?: object, language?: string, now: number }} request
 */
export function outingsContent(catalog, { settings = {}, language = 'en', now }) {
  const text = pick(TEXT, language);
  const period = PERIODS.includes(settings.period) ? settings.period : DEFAULT_PERIOD;
  const periodLabel = pick(PERIOD_LABELS, language)[period];
  if (!catalog.ready) {
    return {
      version: 1,
      ttl_seconds: 60,
      components: [
        { type: 'text', variant: 'caption', text: periodLabel },
        { type: 'text', variant: 'body', text: text.loading },
      ],
    };
  }
  const selected = selectEvents(catalog.visible, parseFilters(settings), periodWindow(period, now));
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: truncate(`${periodLabel} · ${text.count(selected.length)}`, 80),
    },
  ];
  if (selected.length > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: selected
        .slice(0, MAX_ROWS)
        .map((entry) => item(entry, language, now, catalog.fetchedAt)),
    });
  }
  const failing = catalog.failing;
  if (selected.length === 0) {
    components.push({
      type: 'text',
      variant: 'body',
      text: failing ? text.unavailable : text.nothing,
    });
  } else if (failing) {
    components.push({ type: 'text', variant: 'body', text: text.unavailable });
  }
  return { version: 1, ttl_seconds: TTL_SECONDS, components };
}
