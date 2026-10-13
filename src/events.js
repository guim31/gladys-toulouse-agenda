// -----------------------------------------------------------------------------
// The event model shared by the sources, and what is computed from it once:
// the search text of the keywords, the "free" flag, the long runs.
//
// An event:
//   id           'oa:<uid>' (OpenAgenda) or 'st:<identifiant>' (So Toulouse)
//   source       'openagenda' | 'so_toulouse'
//   title, summary, venue, address, city, agenda, price   strings ('' if none)
//   url          https page of the event, or null
//   thumbnail    https address of a small picture, or null
//   free, full   booleans
//   themes       theme keys (src/themes.js), main theme first
//   keywords     the source's keywords
//   allDay       true when the dates carry no time (So Toulouse)
//   occurrences  [[start, end], ...] in ms, sorted, past ones dropped
//   longRun      many dates or a long span: exhibitions, permanent visits
// -----------------------------------------------------------------------------

import { DAY_MS } from './time.js';
import { containsWords, normalize } from './text.js';

/** The Capitole, centre of the search radius. */
export const TOULOUSE = { lat: 43.6045, lon: 1.4442 };

/** Dates kept per event: a daily exhibition over a season fits. */
export const MAX_OCCURRENCES = 200;
/** How far ahead dates are kept. */
export const HORIZON_MS = 400 * DAY_MS;

const FREE_WORDS = [
  'gratuit',
  'gratuite',
  'gratuits',
  'gratuites',
  'entree libre',
  'acces libre',
  'free',
  'sans frais',
];
const PRICE = /(?:^|[^\d])[1-9]\d*(?:[.,]\d+)?\s?(?:€|eur\b|euros?\b)/i;

/**
 * Free from a price text: says so ("Gratuit", "Entrée libre"), and names no
 * price ("10 €, gratuit pour les moins de 12 ans" is not free).
 */
export function isFreeText(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return false;
  }
  if (PRICE.test(text)) {
    return false;
  }
  const words = normalize(text);
  return (
    FREE_WORDS.some((word) => containsWords(words, word)) || /^\s*0(?:[.,]0+)?\s?€\s*$/.test(text)
  );
}

/**
 * True for an exhibition or a permanent visit rather than a one-off outing:
 * more than 7 dates, or more than 14 days from the first to the last.
 * @param {Array<[number, number]>} occurrences all of them, past included
 */
export function isLongRun(occurrences) {
  if (occurrences.length === 0) {
    return false;
  }
  const span = occurrences.at(-1)[1] - occurrences[0][0];
  return occurrences.length > 7 || span > 14 * DAY_MS;
}

/**
 * Sorted, deduplicated dates still to come (ending after `now`), within the
 * horizon and the cap.
 */
export function upcomingOccurrences(occurrences, now) {
  const seen = new Set();
  return occurrences
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end))
    .map(([start, end]) => [start, Math.max(start, end)])
    .filter(([start, end]) => end > now && start < now + HORIZON_MS)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .filter(([start, end]) => {
      const key = `${start}-${end}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, MAX_OCCURRENCES);
}

/** Great-circle distance in kilometres. */
export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** An https address, or null. */
export function httpsUrl(value) {
  if (typeof value !== 'string') {
    return null;
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) {
      return null;
    }
    return url.href.length <= 2048 ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The normalized text the keywords and excluded words are looked for in:
 * title, keywords, place, town, agenda, summary, price. A free event also answers to
 * "gratuit", "free", "gratis" and "kostenlos", whatever its price text says.
 */
export function searchText(event) {
  const parts = [
    event.title,
    ...(event.keywords ?? []),
    event.venue,
    event.address,
    event.city,
    event.agenda,
    event.summary,
    event.price,
  ];
  if (event.free) {
    parts.push('gratuit free gratis kostenlos');
  }
  return normalize(parts.filter(Boolean).join(' | '));
}
