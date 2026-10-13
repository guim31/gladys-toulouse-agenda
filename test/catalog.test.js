// -----------------------------------------------------------------------------
// Downloads and announcements, end to end against the SDK's fake Gladys: the
// first download takes note silently, the next ones announce the new events
// matching a watched word; failures keep what was known; a restart neither
// downloads again too early nor announces again.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ANNOUNCED } from '../src/catalog.js';
import {
  NOW,
  OPENAGENDA_RECORDS,
  SO_TOULOUSE_RECORDS,
  createMemoryStore,
  createWorld,
  withoutUids,
} from './helpers/world.js';

const HOUR = 3600 * 1000;

test('the first download takes note of the agenda without announcing anything', async (t) => {
  const world = await createWorld({ config: { watch_keywords: 'jazz, Cratère' } });
  t.after(() => world.app.stop());
  // 56 events, the same exhibition listed by two agendas shown once.
  assert.equal(world.catalog.visible.length, 55);
  assert.deepEqual(world.fake.sceneEvents, []);
  assert.deepEqual(world.fake.connectionStatuses.at(-1), { connected: true });
  assert.ok(world.fake.widgetRefreshes.includes('outings'));
  assert.deepEqual(world.store.data.seeded, { openagenda: '15', so_toulouse: '15' });
  assert.equal(Object.keys(world.store.data.seen).length, 56);
  // One request per source, with the radius of the configuration.
  const portals = world.web.requests.map((request) => request.url.host).sort();
  assert.deepEqual(portals, ['data.toulouse-metropole.fr', 'public.opendatasoft.com']);
  assert.match(world.web.requests[0].headers['user-agent'] ?? '', /^$|gladys-toulouse-agenda/);
});

test('a new event matching a watched word fires the scene trigger, with its details', async (t) => {
  const newcomers = ['56827868', '42246159', '36921399', '85447119']; // 2 at the Cratère, a concert, a comedy night
  const world = await createWorld({
    config: { watch_keywords: 'Cratère, concert', language: 'fr' },
    web: { openagenda: withoutUids(newcomers) },
  });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.sceneEvents, []);

  world.web.routes.openagenda = OPENAGENDA_RECORDS;
  world.clock.now = NOW + 3 * HOUR;
  const ack = await world.download();
  assert.equal(ack.success, true);
  assert.match(
    ack.data.message.fr,
    /^\d+ événements à venir autour de Toulouse\. Mots surveillés : Cratère 4, concert \d+\.$/,
  );

  const events = world.fake.sceneEvents;
  assert.deepEqual(
    events.map(({ key, data }) => [key, data.title, data.keyword]),
    [
      ['new_event', "Santosh / Soirée The Puzzle Asia et Po's culture", 'Cratère'],
      ['new_event', 'Concert de Professeurs', 'concert'],
      ['new_event', 'Emily / Rencontre avec Didier Castanet, psychanalyste', 'Cratère'],
    ],
  );
  assert.deepEqual(events[1].data, {
    keyword: 'concert',
    theme: 'music',
    free: 'yes',
    city: 'Toulouse',
    title: 'Concert de Professeurs',
    theme_label: 'Musique',
    date: 'demain, 20:00',
    start: '2026-10-15T18:00:00.000Z',
    venue: 'Auditorium Saint-Pierre des Cuisines',
    url: 'https://openagenda.com/conservatoire-de-toulouse/events/concert-7741696',
    price: 'Entrée gratuite sur réservation',
    summary: 'Professeurs en Libertés !',
  });

  // The same events are not announced twice.
  world.clock.now += 3 * HOUR;
  await world.download();
  assert.equal(world.fake.sceneEvents.length, 3);
});

test('no watched word, no announcement; hidden words hide everywhere', async (t) => {
  const world = await createWorld({
    config: { excluded_words: 'Cratère' },
    web: { openagenda: withoutUids(['56827868']) },
  });
  t.after(() => world.app.stop());
  world.web.routes.openagenda = OPENAGENDA_RECORDS;
  await world.download();
  assert.deepEqual(world.fake.sceneEvents, []);
  assert.equal(
    world.catalog.visible.some((event) => event.venue === 'Le Cratère'),
    false,
  );
  // The hidden word removed: the events come back without a new download.
  const requests = world.web.requests.length;
  await world.fake.configUpdated({ excluded_words: '' });
  assert.equal(world.web.requests.length, requests);
  assert.ok(world.catalog.visible.some((event) => event.venue === 'Le Cratère'));
});

test('at most MAX_ANNOUNCED scene events per download, the soonest first', async (t) => {
  const world = await createWorld({
    config: { watch_keywords: 'Toulouse' },
    web: { openagenda: OPENAGENDA_RECORDS.slice(0, 1) },
  });
  t.after(() => world.app.stop());
  world.web.routes.openagenda = OPENAGENDA_RECORDS;
  await world.download();
  assert.equal(world.fake.sceneEvents.length, MAX_ANNOUNCED);
  const starts = world.fake.sceneEvents.map((event) => event.data.start);
  assert.deepEqual(starts, [...starts].sort());
});

test('a source down keeps its previous events; both down keep everything and say so', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(world.catalog.visible.length, 55);

  world.web.routes.soToulouse = new Response('down', { status: 503 });
  const partial = await world.download();
  assert.match(
    partial.data.message.en,
    /So Toulouse unavailable \(data\.toulouse-metropole\.fr: HTTP 503\), previous events kept\./,
  );
  assert.equal(world.catalog.visible.length, 55);
  assert.deepEqual(world.fake.connectionStatuses.at(-1), { connected: true });

  world.web.routes.openagenda = () => new Response('quota', { status: 429 });
  world.web.routes.soToulouse = () => new Error('offline');
  const failed = await world.download();
  assert.match(
    failed.data.message.fr,
    /^Échec du téléchargement : public\.opendatasoft\.com: daily quota reached \(HTTP 429\)/,
  );
  assert.equal(world.catalog.visible.length, 55);
  const status = world.fake.connectionStatuses.at(-1);
  assert.equal(status.connected, false);
  assert.deepEqual(Object.keys(status.message).sort(), ['de', 'en', 'es', 'fr']);
  const content = await world.widget({ period: 'week' });
  assert.match(content.components.at(-1).text, /n'a pas pu être téléchargé/);

  world.web.routes.openagenda = OPENAGENDA_RECORDS;
  world.web.routes.soToulouse = SO_TOULOUSE_RECORDS;
  await world.download();
  assert.deepEqual(world.fake.connectionStatuses.at(-1), { connected: true });
});

test('a restart shows the last download at once, without downloading nor announcing again', async (t) => {
  const store = createMemoryStore();
  const first = await createWorld({ store, config: { watch_keywords: 'concert' } });
  await first.app.stop();
  assert.ok(store.saves >= 1);

  const again = await createWorld({
    store,
    now: NOW + 2 * HOUR,
    config: { watch_keywords: 'concert' },
  });
  t.after(() => again.app.stop());
  assert.equal(again.web.requests.length, 0, 'the last download is recent enough');
  // Minus the events over in the meantime.
  assert.equal(again.catalog.visible.length, 54);
  assert.deepEqual(again.fake.connectionStatuses.at(-1), { connected: true });
  const content = await again.widget({ period: 'week' });
  assert.equal(content.components[1].type, 'card-list');

  // Past the period: downloads on connection, announces nothing already seen.
  const later = await createWorld({
    store,
    now: NOW + 4 * HOUR,
    config: { watch_keywords: 'concert' },
  });
  t.after(() => later.app.stop());
  assert.equal(later.web.requests.length, 2);
  assert.deepEqual(later.fake.sceneEvents, []);
});

test('a new radius brings a new area: noted silently, then watched', async (t) => {
  const world = await createWorld({ config: { watch_keywords: 'Toulouse' } });
  t.after(() => world.app.stop());
  await world.fake.configUpdated({ watch_keywords: 'Toulouse', radius_km: '25' });
  await world.app.idle();
  assert.equal(world.web.requests.at(-2).url.searchParams.get('where').includes('25km'), true);
  assert.deepEqual(world.store.data.seeded, { openagenda: '25', so_toulouse: '25' });
  assert.deepEqual(world.fake.sceneEvents, []);
});

test('the same event in both sources on the same day is shown once (OpenAgenda wins)', async (t) => {
  const concert = OPENAGENDA_RECORDS.find((record) => record.uid === '36921399');
  const twin = {
    ...SO_TOULOUSE_RECORDS[0],
    identifiant: 'FMATWIN',
    nom_de_la_manifestation: 'CONCERT DE PROFESSEURS',
    date_debut: '2026-10-15',
    date_fin: '2026-10-15',
  };
  const world = await createWorld({ web: { openagenda: [concert], soToulouse: [twin] } });
  t.after(() => world.app.stop());
  assert.deepEqual(
    world.catalog.visible.map((event) => event.id),
    ['oa:36921399'],
  );
});

test('ids not seen for 60 days are forgotten', async (t) => {
  const store = createMemoryStore({
    seen: { 'oa:gone': NOW - 61 * 24 * HOUR, 'oa:recent': NOW - 59 * 24 * HOUR },
    seeded: { openagenda: '15', so_toulouse: '15' },
  });
  const world = await createWorld({ store });
  t.after(() => world.app.stop());
  assert.equal(store.data.seen['oa:gone'], undefined);
  assert.equal(store.data.seen['oa:recent'], NOW - 59 * 24 * HOUR);
});
