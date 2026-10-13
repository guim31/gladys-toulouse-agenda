// -----------------------------------------------------------------------------
// Periods read in Toulouse (daylight saving included), and the filters of the
// widget and the summary action.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  isDate,
  localParts,
  parseInstant,
  startOfDay,
  zonedInstant,
} from '../src/time.js';
import { PERIODS, matches, parseFilters, periodWindow, selectEvents } from '../src/filters.js';
import { searchText } from '../src/events.js';

const iso = (ms) => new Date(ms).toISOString();
const at = (text) => Date.parse(text);

test('wall-clock times in Toulouse, across the daylight saving changes', () => {
  assert.equal(iso(zonedInstant('2026-10-24', 12)), '2026-10-24T10:00:00.000Z');
  assert.equal(iso(zonedInstant('2026-10-25', 12)), '2026-10-25T11:00:00.000Z');
  assert.equal(iso(zonedInstant('2026-10-25')), '2026-10-24T22:00:00.000Z');
  assert.equal(iso(zonedInstant('2026-10-26')), '2026-10-25T23:00:00.000Z');
  // 02:30 does not exist on 28 March 2027: an hour later.
  assert.equal(iso(zonedInstant('2027-03-28', 2, 30)), '2027-03-28T01:30:00.000Z');
  assert.deepEqual(localParts(at('2026-10-18T21:59:00Z')), {
    date: '2026-10-18',
    weekday: 7,
    hour: 23,
    minute: 59,
  });
  assert.equal(iso(startOfDay(at('2026-10-14T21:30:00Z'))), '2026-10-13T22:00:00.000Z');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(isDate('2026-02-30'), false);
  assert.equal(isDate('2026-02-28'), true);
  assert.equal(isDate(undefined), false);
  assert.equal(parseInstant('2026-10-17T21:00:00+02:00'), at('2026-10-17T19:00:00Z'));
  assert.ok(Number.isNaN(parseInstant('2026-10-17')));
  assert.ok(Number.isNaN(parseInstant(42)));
});

function window(period, now) {
  const { from, to } = periodWindow(period, at(now));
  return [iso(from), iso(to)];
}

test('the periods, a Wednesday morning', () => {
  const now = '2026-10-14T06:00:00.000Z'; // Wednesday 08:00
  assert.deepEqual(PERIODS, ['today', 'tonight', 'tomorrow', 'weekend', 'week', 'month']);
  assert.deepEqual(window('today', now), [now, '2026-10-14T22:00:00.000Z']);
  assert.deepEqual(window('tonight', now), [
    '2026-10-14T16:00:00.000Z',
    '2026-10-15T03:00:00.000Z',
  ]);
  assert.deepEqual(window('tomorrow', now), [
    '2026-10-14T22:00:00.000Z',
    '2026-10-15T22:00:00.000Z',
  ]);
  assert.deepEqual(window('weekend', now), [
    '2026-10-16T16:00:00.000Z',
    '2026-10-18T22:00:00.000Z',
  ]);
  assert.deepEqual(window('week', now), [now, '2026-10-20T22:00:00.000Z']);
  assert.deepEqual(window('month', now), [now, '2026-11-12T23:00:00.000Z']);
  assert.deepEqual(window('anything', now), window('week', now));
});

test('tonight once the evening has started, and the weekend once it is there', () => {
  assert.deepEqual(window('tonight', '2026-10-14T19:00:00.000Z'), [
    '2026-10-14T19:00:00.000Z',
    '2026-10-15T03:00:00.000Z',
  ]);
  // Friday 10:00: still the coming evening.
  assert.deepEqual(window('weekend', '2026-10-16T08:00:00.000Z'), [
    '2026-10-16T16:00:00.000Z',
    '2026-10-18T22:00:00.000Z',
  ]);
  // Saturday afternoon: from now.
  assert.deepEqual(window('weekend', '2026-10-17T13:00:00.000Z'), [
    '2026-10-17T13:00:00.000Z',
    '2026-10-18T22:00:00.000Z',
  ]);
  // Sunday of the change to winter time: ends at local midnight (23:00 UTC).
  assert.deepEqual(window('weekend', '2026-10-25T09:00:00.000Z'), [
    '2026-10-25T09:00:00.000Z',
    '2026-10-25T23:00:00.000Z',
  ]);
  // Monday: the next weekend.
  assert.deepEqual(window('weekend', '2026-10-19T08:00:00.000Z'), [
    '2026-10-23T16:00:00.000Z',
    '2026-10-25T23:00:00.000Z',
  ]);
});

function event(overrides = {}) {
  const base = {
    id: 'oa:1',
    title: 'Concert de jazz',
    venue: 'Le Bikini',
    address: 'Rue Théodore Monod, Ramonville-Saint-Agne',
    city: 'Ramonville-Saint-Agne',
    agenda: 'Shotgun',
    summary: '',
    price: '',
    keywords: ['jazz'],
    themes: ['music'],
    free: false,
    longRun: false,
    allDay: false,
    occurrences: [[at('2026-10-16T19:00:00Z'), at('2026-10-16T21:00:00Z')]],
    ...overrides,
  };
  return Object.defineProperty(base, 'search', { value: searchText(base), enumerable: false });
}

test('filters: themes, keywords, towns, free only, long runs', () => {
  const concert = event();
  const none = parseFilters({});
  assert.deepEqual(none, { themes: [], keywords: [], cities: [], freeOnly: false, ongoing: false });
  assert.equal(matches(concert, none), true);
  assert.equal(matches(concert, parseFilters({ themes: ['show'] })), false);
  assert.equal(matches(concert, parseFilters({ themes: ['show', 'music'] })), true);
  assert.deepEqual(parseFilters({ themes: ['music', 'nope'] }).themes, ['music']);
  assert.deepEqual(parseFilters({ themes: 'music, show' }).themes, ['music', 'show']);
  assert.equal(matches(concert, parseFilters({ keywords: 'opera, bikini' })), true);
  assert.equal(matches(concert, parseFilters({ keywords: 'opera' })), false);
  assert.equal(matches(concert, parseFilters({ cities: 'Toulouse' })), false);
  assert.equal(matches(concert, parseFilters({ cities: 'toulouse, ramonville saint agne' })), true);
  assert.equal(matches(concert, parseFilters({ free_only: true })), false);
  assert.equal(matches(event({ free: true }), parseFilters({ free_only: 'true' })), true);
  assert.equal(matches(event({ free: true }), parseFilters({ keywords: 'gratuit' })), true);
  assert.equal(matches(event({ free: true }), parseFilters({ keywords: 'kostenlos' })), true);
  assert.equal(matches(event({ longRun: true }), none), false);
  assert.equal(matches(event({ longRun: true }), parseFilters({ ongoing: true })), true);
});

test('selection: the first date in the window, soonest first, long runs last', () => {
  const now = at('2026-10-14T06:00:00Z');
  const weekend = periodWindow('weekend', now);
  const late = event({
    id: 'oa:late',
    title: 'B',
    occurrences: [[at('2026-10-17T19:00:00Z'), at('2026-10-17T21:00:00Z')]],
  });
  const early = event({
    id: 'oa:early',
    title: 'A',
    occurrences: [
      [at('2026-10-14T19:00:00Z'), at('2026-10-14T21:00:00Z')],
      [at('2026-10-16T17:00:00Z'), at('2026-10-16T19:00:00Z')],
      [at('2026-10-18T14:00:00Z'), at('2026-10-18T16:00:00Z')],
    ],
  });
  const running = event({
    id: 'oa:running',
    title: 'C',
    occurrences: [[at('2026-10-16T14:00:00Z'), at('2026-10-16T17:00:00Z')]],
  });
  const outside = event({
    id: 'oa:outside',
    occurrences: [[at('2026-10-20T19:00:00Z'), at('2026-10-20T21:00:00Z')]],
  });
  const expo = event({
    id: 'oa:expo',
    title: 'Expo',
    longRun: true,
    occurrences: [[at('2026-10-01T08:00:00Z'), at('2026-12-01T18:00:00Z')]],
  });
  const selected = selectEvents(
    [late, early, running, outside, expo],
    parseFilters({ ongoing: true }),
    weekend,
  );
  assert.deepEqual(
    selected.map(({ event: { id }, start, dates }) => [id, iso(start), dates]),
    [
      ['oa:running', '2026-10-16T14:00:00.000Z', 1],
      ['oa:early', '2026-10-16T17:00:00.000Z', 2],
      ['oa:late', '2026-10-17T19:00:00.000Z', 1],
      ['oa:expo', '2026-10-01T08:00:00.000Z', 1],
    ],
  );
  assert.equal(selectEvents([expo], parseFilters({}), weekend).length, 0);
});
