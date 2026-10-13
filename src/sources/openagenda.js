// -----------------------------------------------------------------------------
// OpenAgenda, through its public open data export on Opendatasoft
// ("evenements-publics-openagenda", Licence Ouverte / Etalab). Around Toulouse
// it carries the agendas of the city libraries, museums and monuments, the
// Quai des Savoirs, the Cratère, Shotgun (concerts and club nights), the
// suburbs' town agendas… — about 1 500 events to come, refreshed daily.
//
// Fields read: see SELECT. `timings` is a JSON string of every date
// ({ begin, end } with their offset); `status` and `attendancemode` are JSON
// strings too ({ id, label }).
// -----------------------------------------------------------------------------

import { fetchExport } from './opendatasoft.js';
import { TOULOUSE, httpsUrl, isFreeText, isLongRun, upcomingOccurrences } from '../events.js';
import { detectThemes } from '../themes.js';
import { containsWords, normalize, plainText, truncate } from '../text.js';
import { parseInstant } from '../time.js';

export const PORTAL = 'https://public.opendatasoft.com';
export const DATASET = 'evenements-publics-openagenda';

const SELECT = [
  'uid',
  'canonicalurl',
  'title_fr',
  'description_fr',
  'conditions_fr',
  'keywords_fr',
  'timings',
  'location_name',
  'location_address',
  'location_city',
  'location_coordinates',
  'status',
  'attendancemode',
  'originagenda_title',
  'age_max',
  'thumbnail',
].join(',');

// OpenAgenda status ids: 1 scheduled, 2 rescheduled, 3 moved online,
// 4 postponed (no date yet), 5 full, 6 cancelled.
const DROPPED_STATUS = new Set([3, 4, 6]);
const FULL_STATUS = 5;
// Attendance: 1 on site, 2 online only, 3 both.
const ONLINE_ONLY = 2;

// Agendas that are not outings: the job centre's recruitment sessions.
const EXCLUDED_AGENDAS = ['france travail'];

/** The ODSQL query: what is still to come within `radiusKm` of the Capitole. */
export function query(radiusKm) {
  return {
    select: SELECT,
    where: `within_distance(location_coordinates, geom'POINT(${TOULOUSE.lon} ${TOULOUSE.lat})', ${radiusKm}km) and lastdate_end >= now()`,
    order_by: 'uid',
  };
}

/**
 * @param {object} options
 * @param {number} options.radiusKm
 * @param {number} options.now
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} [options.userAgent]
 */
export async function fetchOpenAgenda({ radiusKm, now, fetchImpl, userAgent }) {
  const records = await fetchExport(PORTAL, DATASET, query(radiusKm), { fetchImpl, userAgent });
  return records.map((record) => normalizeRecord(record, now)).filter(Boolean);
}

function parseJson(value, fallback) {
  if (typeof value !== 'string') {
    return value ?? fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * One OpenAgenda record → an event (src/events.js), or null when it is not an
 * outing to offer: no title, a leftover test entry, cancelled, postponed,
 * online only, from an excluded agenda, or with no date left.
 */
export function normalizeRecord(record, now) {
  const uid = record?.uid == null ? '' : String(record.uid).trim();
  const title = plainText(record?.title_fr);
  if (!uid || !title || /^test(?:\s|$)/i.test(title)) {
    return null;
  }
  const status = parseJson(record.status, {})?.id;
  const attendance = parseJson(record.attendancemode, {})?.id;
  if (DROPPED_STATUS.has(status) || attendance === ONLINE_ONLY) {
    return null;
  }
  const agenda = plainText(record.originagenda_title);
  const agendaWords = normalize(agenda);
  if (EXCLUDED_AGENDAS.some((excluded) => containsWords(agendaWords, excluded))) {
    return null;
  }
  const timings = parseJson(record.timings, []);
  const all = (Array.isArray(timings) ? timings : []).map((timing) => [
    parseInstant(timing?.begin),
    parseInstant(timing?.end),
  ]);
  const valid = all.filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end));
  const occurrences = upcomingOccurrences(valid, now);
  if (occurrences.length === 0) {
    return null;
  }
  const keywords = (Array.isArray(record.keywords_fr) ? record.keywords_fr : [])
    .map((keyword) => plainText(String(keyword)))
    .filter(Boolean)
    .filter((keyword, index, list) => list.indexOf(keyword) === index)
    .slice(0, 12);
  const price = truncate(plainText(record.conditions_fr), 300);
  const ageMax = Number(record.age_max);
  return {
    id: `oa:${uid}`,
    source: 'openagenda',
    title: truncate(title, 200),
    summary: truncate(plainText(record.description_fr), 400),
    venue: truncate(plainText(record.location_name), 120),
    address: truncate(plainText(record.location_address), 200),
    city: truncate(plainText(record.location_city), 60),
    agenda: truncate(agenda, 120),
    price,
    url: httpsUrl(record.canonicalurl),
    thumbnail: httpsUrl(record.thumbnail),
    free: isFreeText(price),
    full: status === FULL_STATUS,
    themes: detectThemes([title, ...keywords, agenda], {
      ageMax: record.age_max == null ? null : ageMax,
    }),
    keywords,
    allDay: false,
    occurrences,
    longRun: isLongRun(valid.sort((a, b) => a[0] - b[0])),
  };
}
