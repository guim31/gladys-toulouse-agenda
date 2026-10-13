// -----------------------------------------------------------------------------
// The edges found in review: a stop before the state was read, writes that
// overlap, a scene event refused, the radius changed during a download, a
// source down for weeks, a whole-day run listed by both sources, oversized
// links and pictures.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.js';
import { newEventData } from '../src/scenes.js';
import { ImageCache } from '../src/images.js';
import {
  NOW,
  OPENAGENDA_RECORDS,
  SO_TOULOUSE_RECORDS,
  createMemoryStore,
  createWorld,
} from './helpers/world.js';

const DAY = 24 * 3600 * 1000;

test('the state file is never replaced before it was read, and writes do not overlap', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'toulouse-agenda-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'state.json');
  await writeFile(file, JSON.stringify({ version: 1, data: { fetchedAt: 42 } }));

  const store = createStore(directory);
  await store.save(); // a stop while Gladys was unreachable
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).data, { fetchedAt: 42 });

  await store.load();
  assert.equal(store.get('fetchedAt'), 42);
  store.set('fetchedAt', 43);
  await Promise.all([store.save(), store.save(), store.save()]);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), {
    version: 1,
    data: { fetchedAt: 43 },
  });
});

test('one scene event refused does not cost the others', async (t) => {
  const world = await createWorld({
    config: { watch_keywords: 'concert' },
    web: { openagenda: OPENAGENDA_RECORDS.slice(0, 1) },
  });
  t.after(() => world.app.stop());
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  let calls = 0;
  t.mock.method(world.gladys, 'publishSceneEvent', async (key, data) => {
    calls += 1;
    if (calls === 1) {
      throw new Error('HTTP 503');
    }
    return publish(key, data);
  });
  world.web.routes.openagenda = OPENAGENDA_RECORDS;
  await world.download();
  assert.ok(calls >= 3);
  assert.equal(world.fake.sceneEvents.length, calls - 1);
});

test('a radius changed during a download brings a download of the new area', async (t) => {
  let release;
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.web.routes.openagenda = (url) =>
    url.searchParams.get('where').includes('15km')
      ? new Promise((resolve) => {
          release = () => resolve(OPENAGENDA_RECORDS);
        })
      : OPENAGENDA_RECORDS;
  const running = world.download();
  await new Promise((resolve) => setImmediate(resolve));
  await world.fake.configUpdated({ radius_km: '5' });
  release();
  await running;
  await world.app.idle();
  const radii = world.web.requests
    .filter((request) => request.url.host === 'public.opendatasoft.com')
    .map((request) => request.url.searchParams.get('where').match(/(\d+)km/)[1]);
  assert.deepEqual(radii, ['15', '15', '5']);
  assert.equal(world.store.data.seeded.openagenda, '5');
});

test('the ids of a source down for weeks do not age', async (t) => {
  const store = createMemoryStore({
    seen: { 'st:OLD': NOW - 90 * DAY, 'oa:OLD': NOW - 90 * DAY },
    seeded: { openagenda: '15', so_toulouse: '15' },
  });
  const world = await createWorld({ store, web: { soToulouse: () => new Error('offline') } });
  t.after(() => world.app.stop());
  assert.equal(store.data.seen['st:OLD'], NOW - 90 * DAY);
  assert.equal(store.data.seen['oa:OLD'], undefined);
});

test('a whole-day run already started is shown once when OpenAgenda lists it too', async (t) => {
  const concert = OPENAGENDA_RECORDS.find((record) => record.uid === '36921399');
  const twin = {
    ...SO_TOULOUSE_RECORDS[0],
    identifiant: 'FMATWIN',
    nom_de_la_manifestation: 'Concert de professeurs',
    date_debut: '2026-10-01',
    date_fin: '2026-10-20',
  };
  // Seen from 15 October, when the run has started and the concert is that day.
  const world = await createWorld({
    now: Date.parse('2026-10-15T06:00:00Z'),
    web: { openagenda: [concert], soToulouse: [twin] },
  });
  t.after(() => world.app.stop());
  assert.deepEqual(
    world.catalog.visible.map((event) => event.id),
    ['oa:36921399'],
  );
});

test('a link too long for a scene event is left out; a picture without length is capped', async () => {
  const event = {
    title: 'Concert',
    themes: [],
    free: false,
    allDay: false,
    city: 'Toulouse',
    venue: '',
    price: '',
    summary: '',
    url: `https://openagenda.com/${'a'.repeat(1100)}`,
    occurrences: [[NOW + DAY, NOW + DAY + 3600000]],
  };
  assert.equal(newEventData({ event, keyword: 'concert' }, 'fr', NOW).url, null);

  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < 40; i += 1) {
        controller.enqueue(new Uint8Array(10 * 1024).fill(0xff));
      }
      controller.close();
    },
  });
  const images = new ImageCache({ fetchImpl: async () => new Response(stream) });
  await assert.rejects(
    images.get('https://img.openagenda.com/main/x.thumb.image.jpg'),
    /too large/,
  );
});
