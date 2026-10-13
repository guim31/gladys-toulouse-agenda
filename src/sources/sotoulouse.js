// -----------------------------------------------------------------------------
// "Agenda des manifestations culturelles - So Toulouse", the open data of
// Toulouse Métropole (Licence Ouverte / Etalab). Its dates have no time, its
// hours are free text ("Tous les dimanches et jours fériés"): every event is
// shown as running all day from its first to its last date.
//
// As of October 2026 the dataset has not been updated since 31 December 2025
// and holds almost nothing to come: it is read as a second source, for the
// day Toulouse Métropole publishes it again, and costs one small request.
// -----------------------------------------------------------------------------

import { fetchExport } from './opendatasoft.js';
import {
  TOULOUSE,
  distanceKm,
  httpsUrl,
  isFreeText,
  isLongRun,
  upcomingOccurrences,
} from '../events.js';
import { detectThemes } from '../themes.js';
import { plainText, titleCase, truncate } from '../text.js';
import { addDays, isDate, localParts, zonedInstant } from '../time.js';

export const PORTAL = 'https://data.toulouse-metropole.fr';
export const DATASET = 'agenda-des-manifestations-culturelles-so-toulouse';

/** The ODSQL query: what has not ended yet (by Toulouse date). */
export function query(now) {
  return {
    where: `date_fin >= date'${localParts(now).date}'`,
    order_by: 'identifiant',
  };
}

/**
 * @param {object} options
 * @param {number} options.radiusKm
 * @param {number} options.now
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} [options.userAgent]
 */
export async function fetchSoToulouse({ radiusKm, now, fetchImpl, userAgent }) {
  const records = await fetchExport(PORTAL, DATASET, query(now), { fetchImpl, userAgent });
  return records.map((record) => normalizeRecord(record, now, radiusKm)).filter(Boolean);
}

function point(record) {
  const lat = Number(record.geo_point?.lat ?? record.googlemap_latitude);
  const lon = Number(record.geo_point?.lon ?? record.googlemap_longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)
    ? { lat, lon }
    : null;
}

/**
 * One So Toulouse record → an event (src/events.js), or null: no title, no
 * valid dates, ended, or farther than `radiusKm` (when it has a position).
 */
export function normalizeRecord(record, now, radiusKm = Infinity) {
  const id = typeof record?.identifiant === 'string' ? record.identifiant.trim() : '';
  const title = plainText(record?.nom_de_la_manifestation ?? record?.nom_generique);
  const first = typeof record?.date_debut === 'string' ? record.date_debut.slice(0, 10) : '';
  const last = typeof record?.date_fin === 'string' ? record.date_fin.slice(0, 10) : first;
  if (!id || !title || !isDate(first)) {
    return null;
  }
  const end = isDate(last) && last >= first ? last : first;
  const position = point(record);
  if (position && distanceKm(TOULOUSE, position) > radiusKm) {
    return null;
  }
  const span = [[zonedInstant(first), zonedInstant(addDays(end, 1))]];
  const occurrences = upcomingOccurrences(span, now);
  if (occurrences.length === 0) {
    return null;
  }
  const city = titleCase(plainText(record.commune));
  const postcode = record.code_postal == null ? '' : String(record.code_postal);
  const street = [record.lieu_adresse_1, record.lieu_adresse_2, record.lieu_adresse_3]
    .map(plainText)
    .filter(Boolean)
    .join(', ');
  const address = [street, [postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const price = truncate(
    [
      plainText(record.tarif_normal),
      plainText(record.tarif_enfant) && `enfant ${plainText(record.tarif_enfant)}`,
    ]
      .filter(Boolean)
      .join(', '),
    300,
  );
  const categories = [
    record.type_de_manifestation,
    record.categorie_de_la_manifestation,
    record.theme_de_la_manifestation,
  ]
    .map(plainText)
    .filter(Boolean);
  const keywords = categories
    .flatMap((text) => text.split(/\s*,\s*/))
    .filter((keyword, index, list) => keyword && list.indexOf(keyword) === index);
  const summary = [plainText(record.descriptif_court), plainText(record.horaires)]
    .filter(Boolean)
    .join(' — ');
  return {
    id: `st:${id}`,
    source: 'so_toulouse',
    title: truncate(title, 200),
    summary: truncate(summary, 400),
    venue: truncate(plainText(record.lieu_nom), 120),
    address: truncate(address, 200),
    city: truncate(city, 60),
    agenda: 'So Toulouse',
    price,
    url: httpsUrl(record.reservation_site_internet),
    thumbnail: null,
    free: record.manifestation_gratuite === 'Oui' || isFreeText(plainText(record.tarif_normal)),
    full: false,
    themes: detectThemes([title, ...categories]),
    keywords,
    allDay: true,
    occurrences,
    longRun: isLongRun(span),
  };
}
