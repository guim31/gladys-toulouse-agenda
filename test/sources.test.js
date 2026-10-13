// -----------------------------------------------------------------------------
// The two sources, from real records (test/fixtures, downloaded in October
// 2026): what is kept, what is dropped, and how each field is read.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRecord as openagenda,
  query as openagendaQuery,
} from '../src/sources/openagenda.js';
import {
  normalizeRecord as soToulouse,
  query as soToulouseQuery,
} from '../src/sources/sotoulouse.js';
import { isFreeText, isLongRun, upcomingOccurrences, httpsUrl } from '../src/events.js';
import { NOW, OPENAGENDA_RECORDS, SO_TOULOUSE_RECORDS } from './helpers/world.js';

const record = (uid) => OPENAGENDA_RECORDS.find((item) => item.uid === uid);
const iso = (ms) => new Date(ms).toISOString();

test('the OpenAgenda query: what is to come within the radius of the Capitole', () => {
  const query = openagendaQuery(15);
  assert.match(
    query.where,
    /within_distance\(location_coordinates, geom'POINT\(1\.4442 43\.6045\)', 15km\)/,
  );
  assert.match(query.where, /lastdate_end >= now\(\)/);
  assert.match(query.select, /^uid,canonicalurl,title_fr,/);
  assert.equal(query.order_by, 'uid');
});

test('an OpenAgenda concert: dates with their offset, place, price, picture, theme', () => {
  const event = openagenda(record('36921399'), NOW);
  assert.deepEqual(
    {
      ...event,
      occurrences: event.occurrences.map(([start, end]) => [iso(start), iso(end)]),
    },
    {
      id: 'oa:36921399',
      source: 'openagenda',
      title: 'Concert de Professeurs',
      summary: event.summary,
      venue: 'Auditorium Saint-Pierre des Cuisines',
      address: event.address,
      city: 'Toulouse',
      agenda: 'Conservatoire à rayonnement régional de Toulouse',
      price: event.price,
      url: 'https://openagenda.com/conservatoire-de-toulouse/events/concert-7741696',
      thumbnail: event.thumbnail,
      free: true,
      full: false,
      themes: ['music'],
      keywords: event.keywords,
      allDay: false,
      occurrences: [['2026-10-15T18:00:00.000Z', '2026-10-15T19:30:00.000Z']],
      longRun: false,
    },
  );
  assert.match(event.thumbnail, /^https:\/\/img\.openagenda\.com\/.+\.thumb\.image\.jpg$/);
});

test('OpenAgenda records that are not outings to offer are dropped', () => {
  const dropped = {
    74150493: 'a leftover "test charlotte" entry',
    8393580: 'no French title',
    43873170: 'cancelled',
    6022505: 'cancelled',
    5334698: 'France Travail job session',
    73940190: 'France Travail job session',
    89005237: 'France Travail job session',
  };
  for (const [uid, why] of Object.entries(dropped)) {
    assert.ok(record(uid), uid);
    assert.equal(openagenda(record(uid), NOW), null, why);
  }
  // Ended before now.
  assert.equal(openagenda(record('80832673'), NOW), null, 'performed the day before');
  // On site and online: kept. Full: kept, flagged.
  assert.equal(openagenda(record('35765845'), NOW).id, 'oa:35765845');
  assert.equal(openagenda(record('87435497'), NOW).full, true);
  assert.equal(openagenda(null, NOW), null);
  assert.equal(openagenda({ uid: 1, title_fr: 'Sans dates', timings: 'not json' }, NOW), null);
  const kept = OPENAGENDA_RECORDS.map((item) => openagenda(item, NOW)).filter(Boolean);
  assert.equal(kept.length, 55);
  assert.equal(new Set(kept.map((event) => event.id)).size, kept.length);
});

test('OpenAgenda long runs: only the dates to come are kept, the event is flagged', () => {
  const event = openagenda(record('69092484'), NOW); // Pokémon x ESA, Cité de l'espace
  assert.equal(event.longRun, true);
  assert.ok(event.occurrences.every(([, end]) => end > NOW));
  assert.ok(event.occurrences.length > 30);
  const once = openagenda(record('85447119'), NOW); // a comedy club night
  assert.equal(once.longRun, false);
  assert.deepEqual(once.themes, ['show']);
});

test('So Toulouse: dates without time, read as whole days in Toulouse', () => {
  const [airFrance] = SO_TOULOUSE_RECORDS;
  const event = soToulouse(airFrance, NOW);
  assert.equal(event.id, 'st:FMAMID031V50Y9EK');
  assert.equal(event.allDay, true);
  assert.equal(event.longRun, true);
  assert.equal(event.city, 'Toulouse');
  assert.equal(event.address, '6 rue Jacqueline Auriol, 31400 Toulouse');
  assert.equal(event.price, '9,00 €, enfant 6,00 €');
  assert.equal(event.free, false);
  assert.deepEqual(event.themes, ['exhibition']);
  assert.equal(event.url, null);
  assert.deepEqual(
    event.occurrences.map(([start, end]) => [iso(start), iso(end)]),
    [['2025-02-11T23:00:00.000Z', '2027-02-12T23:00:00.000Z']],
  );
  // Ended before today.
  const ended = SO_TOULOUSE_RECORDS.filter((item) => item.date_fin < '2026-10-14');
  assert.ok(ended.length >= 3);
  for (const item of ended) {
    assert.equal(soToulouse(item, NOW), null, item.identifiant);
  }
  // Out of the radius (the Air France museum is 3 km from the Capitole).
  assert.equal(soToulouse(airFrance, NOW, 2), null);
  assert.equal(
    soToulouse({ identifiant: 'x', nom_de_la_manifestation: 'y', date_debut: '2026-02-30' }, NOW),
    null,
  );
});

test('So Toulouse: a free event, and the query of the day', () => {
  const free = SO_TOULOUSE_RECORDS.find((item) => item.manifestation_gratuite === 'Oui');
  const event = soToulouse({ ...free, date_fin: '2026-12-31' }, NOW);
  assert.equal(event.free, true);
  assert.deepEqual(soToulouseQuery(NOW), {
    where: "date_fin >= date'2026-10-14'",
    order_by: 'identifiant',
  });
  // 23:30 in Toulouse is already the next day in UTC terms: the date is Toulouse's.
  assert.equal(
    soToulouseQuery(Date.parse('2026-10-14T22:30:00Z')).where,
    "date_fin >= date'2026-10-15'",
  );
});

test('free, long run, dates and addresses helpers', () => {
  for (const text of ['Gratuit', 'Entrée libre', 'gratuit sur inscription', 'Accès libre', '0 €']) {
    assert.equal(isFreeText(text), true, text);
  }
  for (const text of [
    '',
    'À partir de 6.29 €',
    '10€, gratuit pour les moins de 12 ans',
    'Participation libre',
    'Sur inscription',
    null,
  ]) {
    assert.equal(isFreeText(text), false, String(text));
  }
  assert.equal(isLongRun([]), false);
  assert.equal(isLongRun([[0, 15 * 86400000]]), true);
  assert.equal(isLongRun(Array.from({ length: 8 }, (_, i) => [i, i + 1])), true);
  assert.deepEqual(
    upcomingOccurrences(
      [
        [5, 3],
        [1, 2],
        [5, 3],
        [Number.NaN, 9],
      ],
      2,
    ),
    [[5, 5]],
  );
  assert.equal(httpsUrl('http://example.org'), null);
  assert.equal(httpsUrl('https://user:pw@example.org'), null);
  assert.equal(httpsUrl('not a url'), null);
  assert.equal(httpsUrl(' https://example.org/a '), 'https://example.org/a');
});
